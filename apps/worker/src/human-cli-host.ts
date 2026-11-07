import { randomUUID } from "node:crypto";
import {
  humanCliWorkerCommandSchema,
  type HumanCliState,
} from "@ajankati/contracts";
import { AgentRegistry } from "./agent-registry";
import {
  withNativePath,
  type NativePathIdentity,
} from "./native-path-boundary";
import { sha256File } from "./executable-digest";
import {
  defaultProtectedRoots,
  startupConfigSurface,
  workspaceScopeViolation,
} from "./workspace-policy";
import { evaluateLaunchReadiness } from "./launch-readiness";

/** Closed set of reason codes that may cross to the renderer. Never free text. */
export const HUMAN_CLI_ERROR_CODES = new Set([
  "OWNER_STOPPED",
  "BUSY",
  "WORKSPACE_LIMIT",
  "WORKSPACE_UNKNOWN",
  "WORKSPACE_TOO_BROAD",
  "IDENTITY_CHANGED",
  "IDENTITY_UNAVAILABLE",
  "PREPARATION_TIMEOUT",
  "SESSION_OWNER",
  "CONSENT_INVALID",
  "CONSENT_EXPIRED",
  "REAL_LAUNCH_DISABLED",
]);
/** Non-sensitive diagnostic: allow-listed code (+ blocker count) or nothing. */
export function diagnosticOf(error: unknown): string | null {
  if (!(error instanceof Error) || !HUMAN_CLI_ERROR_CODES.has(error.message))
    return null;
  const blockers = (error as Error & { blockers?: unknown }).blockers;
  return typeof blockers === "number"
    ? `${error.message}; blockers=${blockers}`
    : error.message;
}
export type HumanCliHostOptions = {
  digest?: (path: string, signal?: AbortSignal) => Promise<string>;
  protectedRoots?: readonly string[];
  startupConfig?: (workspacePath: string) => string[];
};

/** Preparation only. No launcher, provider input, task dispatch or enabling flag.
 * Workspace registrations come from the trusted owner, never renderer payloads.
 * One instance belongs to one worker/desktop connection; no reconnect/replay. */
export class HumanCliHost {
  private readonly workspaces = new Map<string, NativePathIdentity>();
  private session: HumanCliState["session"] = null;
  private identity = "";
  private createdAt = 0;
  private createdMono = 0;
  private expiry?: ReturnType<typeof setTimeout>;
  private busy = false;
  private stopped = false;
  private readonly abort = new AbortController();
  private readonly digest: NonNullable<HumanCliHostOptions["digest"]>;
  private readonly protectedRoots: readonly string[];
  private readonly startupConfig: NonNullable<
    HumanCliHostOptions["startupConfig"]
  >;
  constructor(
    private readonly agents: AgentRegistry,
    options: HumanCliHostOptions = {},
  ) {
    this.digest = options.digest ?? sha256File;
    this.protectedRoots = options.protectedRoots ?? defaultProtectedRoots();
    this.startupConfig = options.startupConfig ?? startupConfigSurface;
  }
  async execute(input: unknown): Promise<HumanCliState> {
    const command = humanCliWorkerCommandSchema.parse(input);
    if (this.stopped) throw new Error("OWNER_STOPPED");
    if (this.busy) throw new Error("BUSY");
    this.expire();
    if (command.method === "list") return this.state();
    this.busy = true;
    try {
      if (command.method === "register-workspace") {
        if (this.session?.status === "prepared") throw new Error("BUSY");
        const identity = withNativePath(
          command.payload.path,
          true,
          (value) => value,
        );
        if (workspaceScopeViolation(identity.finalPath, this.protectedRoots))
          throw new Error("WORKSPACE_TOO_BROAD");
        for (const [workspaceId, previous] of this.workspaces) {
          if (
            previous.finalPath.toLowerCase() ===
            identity.finalPath.toLowerCase()
          ) {
            if (JSON.stringify(previous) !== JSON.stringify(identity)) {
              this.workspaces.delete(workspaceId);
              throw new Error("IDENTITY_CHANGED");
            }
            return this.state();
          }
        }
        if (this.workspaces.size >= 16) throw new Error("WORKSPACE_LIMIT");
        this.workspaces.set(randomUUID(), identity);
        return this.state();
      }
      if (command.method === "prepare") {
        if (this.session?.status === "prepared") throw new Error("BUSY");
        const registered = this.workspaces.get(command.payload.workspaceId);
        if (!registered) throw new Error("WORKSPACE_UNKNOWN");
        const started = performance.now();
        const agent = await this.agents.terminalIdentity(
          command.payload.integrationId,
        );
        if (this.stopped) throw new Error("OWNER_STOPPED");
        if (performance.now() - started >= 10000)
          throw new Error("PREPARATION_TIMEOUT");
        const pin = await this.pin(agent.executable);
        if (this.stopped) throw new Error("OWNER_STOPPED");
        if (performance.now() - started >= 10000)
          throw new Error("PREPARATION_TIMEOUT");
        const workspace = this.workspace(command.payload.workspaceId);
        this.createdAt = Date.now();
        this.createdMono = performance.now();
        this.identity = this.seal(agent, workspace, pin);
        this.session = {
          sessionId: randomUUID(),
          integrationId: command.payload.integrationId,
          workspaceId: command.payload.workspaceId,
          workspacePath: registered.finalPath,
          executable: agent.executable,
          status: "prepared",
          approvalToken: randomUUID(),
          expiresAt: this.createdAt + 60000,
        };
        clearTimeout(this.expiry);
        this.expiry = setTimeout(() => {
          if (this.session?.status === "prepared") {
            this.session.status = "expired";
            this.session.approvalToken = null;
          }
        }, 60000);
        this.expiry.unref();
        return this.state();
      }
      const session = this.session;
      if (!session || session.sessionId !== command.payload.sessionId)
        throw new Error("SESSION_OWNER");
      if (command.method === "stop") {
        clearTimeout(this.expiry);
        session.approvalToken = null;
        session.status = "stopped";
        return this.state();
      }
      if (
        session.status !== "prepared" ||
        !session.approvalToken ||
        session.approvalToken !== command.payload.approvalToken
      ) {
        if (session.status === "prepared") {
          session.approvalToken = null;
          session.status = "blocked";
          clearTimeout(this.expiry);
        }
        throw new Error("CONSENT_INVALID");
      }
      // Consume before any await; failures must never leave reusable authority.
      session.approvalToken = null;
      session.status = "blocked";
      clearTimeout(this.expiry);
      try {
        const agent = await this.agents.terminalIdentity(session.integrationId);
        const pin = await this.pin(agent.executable);
        const workspace = this.workspace(session.workspaceId);
        if (this.seal(agent, workspace, pin) !== this.identity)
          throw new Error("IDENTITY_CHANGED");
      } catch {
        throw new Error("IDENTITY_CHANGED");
      }
      if (this.stopped) throw new Error("OWNER_STOPPED");
      if (this.elapsed()) {
        session.status = "expired";
        throw new Error("CONSENT_EXPIRED");
      }
      // Even valid human consent is NOT proof of provider compatibility/safety.
      const readiness = evaluateLaunchReadiness({
        integrationId: session.integrationId,
        verifiedVersion: this.agents.verifiedVersion(session.integrationId),
        startupConfig: this.startupConfig(session.workspacePath),
      });
      throw Object.assign(new Error("REAL_LAUNCH_DISABLED"), {
        blockers: readiness.blockers.length,
      });
    } finally {
      this.busy = false;
    }
  }
  /** Content digests of the exact image (and its source shim) pin what metadata
   * fingerprints alone cannot: an in-place rewrite that preserves size/timestamps. */
  private async pin(executable: {
    path: string;
    sourceCanonicalPath: string;
  }): Promise<string[]> {
    const paths = [
      ...new Set([executable.path, executable.sourceCanonicalPath]),
    ];
    return Promise.all(
      paths.map((path) => this.digest(path, this.abort.signal)),
    );
  }
  private seal(
    agent: unknown,
    workspace: NativePathIdentity,
    pin: string[],
  ): string {
    return JSON.stringify({
      agent,
      workspace,
      pin,
      startupConfig: this.startupConfig(workspace.finalPath),
    });
  }
  private workspace(id: string): NativePathIdentity {
    const expected = this.workspaces.get(id);
    if (!expected) throw new Error("WORKSPACE_UNKNOWN");
    try {
      const actual = withNativePath(expected.finalPath, true, (value) => value);
      if (JSON.stringify(expected) !== JSON.stringify(actual))
        throw new Error("IDENTITY_CHANGED");
      return actual;
    } catch {
      this.workspaces.delete(id);
      throw new Error("IDENTITY_CHANGED");
    }
  }
  private elapsed() {
    return (
      Date.now() < this.createdAt ||
      Date.now() >= this.createdAt + 60000 ||
      performance.now() - this.createdMono >= 60000
    );
  }
  private expire() {
    if (this.session?.status === "prepared" && this.elapsed()) {
      this.session.status = "expired";
      this.session.approvalToken = null;
    }
  }
  private state(): HumanCliState {
    return structuredClone({
      mode: "human-controlled",
      liveLaunch: false,
      managedExecution: false,
      workspaces: [...this.workspaces].map(([workspaceId, identity]) => ({
        workspaceId,
        path: identity.finalPath,
      })),
      session: this.session,
    });
  }
  async stop(): Promise<void> {
    this.stopped = true;
    this.abort.abort();
    clearTimeout(this.expiry);
    this.workspaces.clear();
    if (this.session) {
      this.session.status = "stopped";
      this.session.approvalToken = null;
    }
  }
}
