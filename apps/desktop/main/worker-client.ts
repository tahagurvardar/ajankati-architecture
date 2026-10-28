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
} from "@ajankati/contracts";

type Pending = {
  resolve: (snapshot: Snapshot | TerminalState | AgentState) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
export class WorkerClient {
  private child: ChildProcess;
  private pending = new Map<string, Pending>();
  readonly ready: Promise<void>;
  constructor(
    workerPath: string,
    databasePath: string,
    electronRuntime = false,
  ) {
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
      this.child.on("message", (input: unknown) => {
        if (
          typeof input === "object" &&
          input !== null &&
          "type" in input &&
          input.type === "worker.ready" &&
          "version" in input &&
          input.version === 1
        ) {
          clearTimeout(timer);
          resolve();
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
        const parsed = isAgents
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
  }
  private failAll(): void {
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
  private async send(
    command: Command | TerminalCommand | AgentCommand,
    protocol: "tasks" | "terminal" | "agents",
  ): Promise<Snapshot | TerminalState | AgentState> {
    await this.ready;
    if (this.pending.size >= 32)
      throw new Error("Bekleyen istek sınırı aşıldı.");
    const request =
      protocol === "agents"
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
    if (!this.child.connected) throw new Error("İşçi bağlı değil.");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.requestId);
        reject(
          new Error(
            "Yanıt alınamadı. Sonucu yenileyerek kontrol edin; işlem otomatik tekrarlanmadı.",
          ),
        );
      }, 10000);
      this.pending.set(request.requestId, { resolve, reject, timer });
      this.child.send(request, (error) => {
        if (error) {
          clearTimeout(timer);
          this.pending.delete(request.requestId);
          reject(new Error("İstek gönderilemedi."));
        }
      });
    });
  }
  async close(): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => {
      this.child.once("exit", () => resolve());
    });
    if (this.child.connected) this.child.disconnect();
    const timer = setTimeout(() => this.child.kill(), 8000);
    await exited;
    clearTimeout(timer);
    this.failAll();
  }
}
