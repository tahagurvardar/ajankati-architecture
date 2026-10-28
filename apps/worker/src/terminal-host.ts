import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, release } from "node:os";
import { join } from "node:path";
import { spawn, type IPty } from "node-pty";
import { createDiagnosticJob, type DiagnosticJob } from "./job-owner";
import {
  terminalCommandSchema,
  type TerminalCommand,
  type TerminalState,
} from "@ajankati/contracts";

// UTF-16 units: at most 1 MiB retained JS text (<= 2 MiB UTF-8 on the wire).
export const OUTPUT_LIMIT = 512 * 1024;
export class OutputBuffer {
  private text = "";
  private end = 0;
  append(data: string): void {
    this.end += data.length;
    this.text = (this.text + data).slice(-OUTPUT_LIMIT);
    if (/^[\uDC00-\uDFFF]/.test(this.text)) this.text = this.text.slice(1);
  }
  read(cursor: number) {
    if (cursor > this.end) throw new Error("Geçersiz çıktı sırası.");
    const start = this.end - this.text.length;
    const from = Math.max(cursor, start);
    let output = this.text.slice(from - start, from - start + 8192);
    if (/[\uD800-\uDBFF]$/.test(output)) output = output.slice(0, -1);
    return {
      output,
      cursor: from + output.length,
      dropped: Math.max(0, start - cursor),
    };
  }
}
type Session = {
  id: string;
  pty: IPty;
  job: DiagnosticJob;
  deadline?: ReturnType<typeof setTimeout>;
  directory: string;
  output: OutputBuffer;
  status: "running" | "exited";
  rootExited: boolean;
  exitCode: number | null;
  exited: Promise<void>;
  disposables: { dispose(): void }[];
  terminating?: Promise<void>;
};
export class TerminalHost {
  constructor(
    private readonly directoryRoot = tmpdir(),
    private readonly createJob = createDiagnosticJob,
    private readonly timeoutMs = 5 * 60 * 1000,
  ) {}
  private session?: Session;
  private stopped = false;
  private closing = false;
  private starting = false;
  private failed = false;
  private inputWindow = 0;
  private inputBytes = 0;

  async execute(raw: TerminalCommand): Promise<TerminalState> {
    const command = terminalCommandSchema.parse(raw);
    if (this.stopped || this.closing || this.starting || this.failed)
      throw new Error("Terminal kapatılıyor veya sahiplik doğrulanamadı.");
    if (command.method === "start") {
      if (process.platform !== "win32")
        throw new Error("ConPTY yalnız Windows'ta kullanılabilir.");
      if (Number(release().split(".")[2]) < 18309)
        throw new Error("Bu Windows sürümünde ConPTY desteklenmiyor.");
      if (this.session?.status === "running")
        throw new Error("Bir terminal zaten açık.");
      this.starting = true;
      if (this.session) {
        try {
          await this.terminate(this.session);
        } catch (error) {
          this.failed = true;
          this.starting = false;
          throw error;
        }
      }
      if (this.stopped) {
        this.starting = false;
        throw new Error("Terminal kapatılıyor.");
      }
      this.release();
      const directory = mkdtempSync(
        join(this.directoryRoot, "AjanKatı terminal "),
      );
      let job: DiagnosticJob | undefined;
      try {
        job = this.createJob();
        const env: Record<string, string> = {};
        for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP"])
          if (process.env[key]) env[key] = process.env[key]!;
        const pty = spawn(
          join(__dirname, "../dist/diagnostic_bootstrap.exe"),
          [job.name],
          {
            name: "xterm-256color",
            cols: command.payload.cols,
            rows: command.payload.rows,
            cwd: directory,
            env,
            useConpty: true,
            // Bundled Microsoft ConPTY closes owned handles directly. The system
            // backend's kill helper enumerates PIDs asynchronously after console close.
            useConptyDll: true,
          },
        );
        let exited!: () => void;
        const session: Session = {
          id: randomUUID(),
          pty,
          job,
          directory,
          output: new OutputBuffer(),
          status: "running",
          rootExited: false,
          exitCode: null,
          exited: new Promise<void>((resolve) => {
            exited = resolve;
          }),
          disposables: [],
        };
        session.disposables.push(
          pty.onData((data) => session.output.append(data)),
          pty.onExit((event) => {
            session.rootExited = true;
            session.exitCode = event.exitCode;
            exited();
            // Root exit is not proof of descendant exit. Always drain the job.
            void this.terminate(session).catch(() => {
              this.failed = true;
            });
          }),
        );
        this.session = session;
        this.inputBytes = 0;
        this.inputWindow = Date.now();
        const until = Date.now() + 10000;
        while (!session.output.read(0).output.includes("READY Türkçe ConPTY")) {
          if (this.stopped || session.rootExited || Date.now() > until)
            throw new Error("Contained diagnostic launch failed.");
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        if (this.stopped || session.terminating)
          throw new Error("Terminal kapatılıyor.");
        if (job.active() < 2)
          throw new Error("Diagnostic job membership missing.");
        session.deadline = setTimeout(() => {
          void this.terminate(session).catch(() => {
            this.failed = true;
          });
        }, this.timeoutMs);
        return this.state(session, 0);
      } catch (error) {
        if (this.session) {
          await this.terminate(this.session).catch(() => {
            this.failed = true;
          });
        } else if (job) {
          try {
            job.terminate();
          } catch {
            this.failed = true;
          } finally {
            try {
              job.close();
            } catch {
              this.failed = true;
            }
          }
        }
        rmSync(directory, { recursive: true, force: true });
        throw error;
      } finally {
        this.starting = false;
      }
    }
    const session = this.session;
    if (!session || session.id !== command.payload.sessionId)
      throw new Error("Terminal sahipliği geçersiz.");
    if (command.method === "read")
      return this.state(session, command.payload.cursor);
    if (command.method === "close") {
      this.closing = true;
      try {
        await this.terminate(session);
      } catch (error) {
        this.failed = true;
        throw error;
      } finally {
        this.closing = false;
      }
      return this.state(session, 0);
    }
    if (session.status !== "running") throw new Error("Terminal sonlandı.");
    if (session.terminating) throw new Error("Terminal kapatılıyor.");
    switch (command.method) {
      case "input": {
        const now = Date.now();
        if (now - this.inputWindow >= 1000) {
          this.inputWindow = now;
          this.inputBytes = 0;
        }
        this.inputBytes += Buffer.byteLength(command.payload.data);
        if (this.inputBytes > 16384)
          throw new Error("Terminal giriş hızı aşıldı.");
        session.pty.write(command.payload.data);
        break;
      }
      case "resize":
        session.pty.resize(command.payload.cols, command.payload.rows);
        break;
      case "interrupt":
        session.pty.write("\u0003");
        break;
    }
    return this.state(session, 0);
  }
  private state(session: Session, cursor: number): TerminalState {
    return {
      sessionId: session.id,
      pid: session.pty.pid,
      status: session.status,
      exitCode: session.exitCode,
      ...session.output.read(cursor),
    };
  }
  private async terminate(session: Session) {
    session.terminating ??= this.finish(session).catch((error: unknown) => {
      this.failed = true;
      // KILL_ON_JOB_CLOSE is the last-resort containment path. Never turn an
      // unverified cleanup into success or permit another process group.
      session.job.close();
      throw error;
    });
    return session.terminating;
  }
  private async finish(session: Session) {
    clearTimeout(session.deadline);
    if (!session.rootExited) {
      session.pty.write("\u0003");
      let grace: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        session.exited,
        new Promise<void>((resolve) => {
          grace = setTimeout(resolve, 2000);
        }),
      ]);
      clearTimeout(grace);
    }
    // Job membership, not console PID enumeration, is the termination authority.
    session.job.terminate();
    const until = Date.now() + 3000;
    while (session.job.active() !== 0) {
      if (Date.now() > until)
        throw new Error("Job cleanup could not be verified.");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        session.exited,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Terminal kapanışı doğrulanamadı.")),
            3000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    session.job.close();
    session.status = "exited";
    rmSync(session.directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
  private release() {
    if (!this.session) return;
    clearTimeout(this.session.deadline);
    for (const disposable of this.session.disposables) disposable.dispose();
    rmSync(this.session.directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
    this.session = undefined;
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.session) await this.terminate(this.session);
    this.release();
  }
}
