import { randomUUID } from "node:crypto";
import { humanCliCommandSchema, type HumanCliState } from "@ajankati/contracts";
import { AgentRegistry } from "./agent-registry";
import { withNativePath } from "./native-path-boundary";

/** Preparation only. No launcher, provider input, task dispatch or enabling flag.
 * Workspace registrations come from the trusted owner, never renderer payloads.
 * One instance belongs to one worker/desktop connection; no reconnect/replay. */
export class HumanCliHost {
  private readonly workspaces: ReadonlyMap<string, string>;
  private session: HumanCliState["session"] = null;
  private identity = "";
  private createdAt = 0;
  private busy = false;
  private stopped = false;
  constructor(
    private readonly agents: AgentRegistry,
    workspaces: ReadonlyMap<string, string> = new Map(),
  ) {
    this.workspaces = new Map(workspaces);
  }
  async execute(input: unknown): Promise<HumanCliState> {
    const command = humanCliCommandSchema.parse(input);
    if (this.stopped) throw new Error("OWNER_STOPPED");
    if (this.busy) throw new Error("BUSY");
    this.expire();
    if (command.method === "list") return this.state();
    this.busy = true;
    try {
      if (command.method === "prepare") {
        if (this.session?.status === "prepared") throw new Error("BUSY");
        const path = this.workspaces.get(command.payload.workspaceId);
        if (!path) throw new Error("WORKSPACE_UNKNOWN");
        const agent = await this.agents.terminalIdentity(
          command.payload.integrationId,
        );
        if (this.stopped) throw new Error("OWNER_STOPPED");
        const workspace = withNativePath(path, true, (value) => value);
        this.createdAt = Date.now();
        this.identity = JSON.stringify({ agent, workspace });
        this.session = {
          sessionId: randomUUID(),
          integrationId: command.payload.integrationId,
          workspaceId: command.payload.workspaceId,
          workspacePath: path,
          executable: agent.executable,
          status: "prepared",
          approvalToken: randomUUID(),
          expiresAt: this.createdAt + 60000,
        };
        return this.state();
      }
      const session = this.session;
      if (!session || session.sessionId !== command.payload.sessionId)
        throw new Error("SESSION_OWNER");
      if (command.method === "stop") {
        session.approvalToken = null;
        session.status = "stopped";
        return this.state();
      }
      if (
        session.status !== "prepared" ||
        !session.approvalToken ||
        session.approvalToken !== command.payload.approvalToken
      )
        throw new Error("CONSENT_INVALID");
      // Consume before any await; failures must never leave reusable authority.
      session.approvalToken = null;
      session.status = "blocked";
      try {
        const agent = await this.agents.terminalIdentity(session.integrationId);
        const workspace = withNativePath(
          session.workspacePath,
          true,
          (value) => value,
        );
        if (JSON.stringify({ agent, workspace }) !== this.identity)
          throw new Error("IDENTITY_CHANGED");
      } catch {
        throw new Error("IDENTITY_CHANGED");
      }
      if (this.stopped) throw new Error("OWNER_STOPPED");
      // Even valid human consent is NOT proof of provider compatibility/safety.
      throw new Error("REAL_LAUNCH_DISABLED");
    } finally {
      this.busy = false;
    }
  }
  private expire() {
    if (
      this.session?.status === "prepared" &&
      (Date.now() < this.createdAt || Date.now() >= this.session.expiresAt)
    ) {
      this.session.status = "expired";
      this.session.approvalToken = null;
    }
  }
  private state(): HumanCliState {
    return structuredClone({
      mode: "human-controlled",
      liveLaunch: false,
      managedExecution: false,
      session: this.session,
    });
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.session) {
      this.session.status = "stopped";
      this.session.approvalToken = null;
    }
  }
}
