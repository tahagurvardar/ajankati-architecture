import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  MAX_FRAME_BYTES,
  parseRequest,
  responseSchema,
  type Command,
  type Snapshot,
  terminalRequestSchema,
  terminalResponseSchema,
  type TerminalCommand,
  type TerminalState,
  agentRequestSchema,
  agentResponseSchema,
  type AgentCommand,
  type AgentState,
  sessionRequestSchema,
  sessionResponseSchema,
  type SessionCommand,
  type SessionState,
  humanCliRequestSchema,
  humanCliResponseSchema,
  type HumanCliWorkerCommand,
  type HumanCliState,
} from "@ajankati/contracts";

type Pending = {
  resolve: (
    snapshot:
      | Snapshot
      | TerminalState
      | AgentState
      | SessionState
      | HumanCliState,
  ) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  protocol: string;
};
export class WorkerClient {
  private child: ChildProcess;
  private pending = new Map<string, Pending>();
  private failed = false;
  readonly ready: Promise<void>;
  private readonly closeGraceMs: number;
  private readonly killWaitMs: number;
  constructor(
    workerPath: string,
    databasePath: string,
    electronRuntime = false,
    options: { closeGraceMs?: number; killWaitMs?: number } = {},
  ) {
    this.closeGraceMs = options.closeGraceMs ?? 8000;
    this.killWaitMs = options.killWaitMs ?? 3000;
    const env: NodeJS.ProcessEnv = {};
    for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "LANG"])
      if (process.env[key]) env[key] = process.env[key];
    if (electronRuntime) env.ELECTRON_RUN_AS_NODE = "1";
    this.child = fork(workerPath, [databasePath], {
      env,
      execArgv: [],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    // No raw provider/env output is forwarded to renderer or logs.
    this.child.stdout?.resume();
    this.child.stderr?.resume();
    this.ready = new Promise((resolve, reject) => {
      let started = false;
      const timer = setTimeout(() => {
        reject(new Error("İşçi başlatma süresi aşıldı."));
        this.child.kill();
      }, 10000);
      const startupError = () => {
        clearTimeout(timer);
        reject(new Error("İşçi başlatılamadı."));
      };
      this.child.once("error", startupError);
      this.child.once("exit", startupError);
      this.child.once("disconnect", startupError);
      this.child.on("message", (input: unknown) => {
        if (
          typeof input === "object" &&
          input !== null &&
          "type" in input &&
          input.type === "worker.ready" &&
          "version" in input &&
          input.version === 1
        ) {
          if (started || Object.keys(input).length !== 2) {
            startupError();
            this.failAll();
            this.child.kill();
            return;
          }
          started = true;
          clearTimeout(timer);
          resolve();
          return;
        }
        if (!started) {
          startupError();
          this.failAll();
          this.child.kill();
          return;
        }
        if (Buffer.byteLength(JSON.stringify(input)) > MAX_FRAME_BYTES) {
          this.failAll();
          this.child.kill();
          return;
        }
        const isTerminal =
          typeof input === "object" && input !== null && "protocol" in input;
        const isAgents =
          typeof input === "object" &&
          input !== null &&
          "protocol" in input &&
          input.protocol === "agents";
        const isSessions =
          typeof input === "object" &&
          input !== null &&
          "protocol" in input &&
          input.protocol === "sessions";
        const isHumanCli =
          typeof input === "object" &&
          input !== null &&
          "protocol" in input &&
          input.protocol === "human-cli";
        const parsed = isHumanCli
          ? humanCliResponseSchema.safeParse(input)
          : isSessions
            ? sessionResponseSchema.safeParse(input)
            : isAgents
              ? agentResponseSchema.safeParse(input)
              : isTerminal
                ? terminalResponseSchema.safeParse(input)
                : responseSchema.safeParse(input);
        if (!parsed.success) {
          this.failAll();
          this.child.kill();
          return;
        }
        const response = parsed.data;
        const waiter = this.pending.get(response.requestId);
        if (!waiter) return;
        if (
          ("protocol" in response ? response.protocol : "tasks") !==
          waiter.protocol
        ) {
          this.failAll();
          this.child.kill();
          return;
        }
        clearTimeout(waiter.timer);
        this.pending.delete(response.requestId);
        if (response.ok) waiter.resolve(response.data);
        else
          waiter.reject(
            new Error(
              typeof response.error === "string"
                ? response.error
                : response.error.message,
            ),
          );
      });
    });
    this.child.on("exit", () => this.failAll());
    this.child.on("error", () => this.failAll());
    this.child.on("disconnect", () => this.failAll());
  }
  private failAll(): void {
    this.failed = true;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("İşçi bağlantısı kesildi."));
    }
    this.pending.clear();
  }
  async request(command: Command): Promise<Snapshot> {
    return this.send(command, "tasks") as Promise<Snapshot>;
  }
  async terminal(command: TerminalCommand): Promise<TerminalState> {
    return this.send(command, "terminal") as Promise<TerminalState>;
  }
  async agents(command: AgentCommand): Promise<AgentState> {
    return this.send(command, "agents") as Promise<AgentState>;
  }
  async sessions(command: SessionCommand): Promise<SessionState> {
    return this.send(command, "sessions") as Promise<SessionState>;
  }
  async humanCli(command: HumanCliWorkerCommand): Promise<HumanCliState> {
    return this.send(command, "human-cli") as Promise<HumanCliState>;
  }
  private async send(
    command:
      | Command
      | TerminalCommand
      | AgentCommand
      | SessionCommand
      | HumanCliWorkerCommand,
    protocol: "tasks" | "terminal" | "agents" | "sessions" | "human-cli",
  ): Promise<
    Snapshot | TerminalState | AgentState | SessionState | HumanCliState
  > {
    await this.ready;
    if (this.failed) throw new Error("İşçi bağlantısı kapatıldı.");
    if (this.pending.size >= 32)
      throw new Error("Bekleyen istek sınırı aşıldı.");
    const request =
      protocol === "human-cli"
        ? humanCliRequestSchema.parse({
            protocol,
            version: 1,
            requestId: randomUUID(),
            command,
          })
        : protocol === "sessions"
          ? sessionRequestSchema.parse({
              protocol,
              version: 1,
              requestId: randomUUID(),
              command,
            })
          : protocol === "agents"
            ? agentRequestSchema.parse({
                protocol: "agents",
                version: 1,
                requestId: randomUUID(),
                command,
              })
            : protocol === "terminal"
              ? terminalRequestSchema.parse({
                  protocol: "terminal",
                  version: 1,
                  requestId: randomUUID(),
                  command,
                })
              : parseRequest({
                  ...command,
                  version: 1,
                  requestId: randomUUID(),
                });
    if (Buffer.byteLength(JSON.stringify(request)) > MAX_FRAME_BYTES)
      throw new Error("İstek boyutu aşıldı.");
    if (!this.child.connected) throw new Error("İşçi bağlı değil.");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(request.requestId);
          reject(
            new Error(
              "Yanıt alınamadı. Sonucu yenileyerek kontrol edin; işlem otomatik tekrarlanmadı.",
            ),
          );
          if (protocol === "human-cli") {
            this.failAll();
            if (this.child.connected) this.child.disconnect();
          }
        },
        protocol === "terminal" && command.method === "start" ? 20000 : 10000,
      );
      this.pending.set(request.requestId, { resolve, reject, timer, protocol });
      this.child.send(request, (error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(request.requestId);
          reject(new Error("İstek gönderilemedi."));
          if (protocol === "human-cli") {
            this.failAll();
            if (this.child.connected) this.child.disconnect();
          }
        }
      });
    });
  }
  async close(): Promise<void> {
    this.failAll();
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => {
      this.child.once("exit", () => resolve());
    });
    if (this.child.connected) this.child.disconnect();
    // Graceful disconnect first, then a forced kill; a child that still reports no
    // exit must not hold application quit forever. The job-owned descendants die with
    // the worker process, so the bounded wait never leaves an authority behind.
    let killWait: ReturnType<typeof setTimeout> | undefined;
    let settle!: () => void;
    const gone = new Promise<void>((resolve) => {
      settle = resolve;
    });
    void exited.then(() => settle());
    const timer = setTimeout(() => {
      this.child.kill();
      killWait = setTimeout(() => settle(), this.killWaitMs);
    }, this.closeGraceMs);
    await gone;
    clearTimeout(timer);
    clearTimeout(killWait);
    this.failAll();
  }
}
