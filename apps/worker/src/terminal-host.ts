import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir, release } from "node:os";
import { join } from "node:path";
import { spawn, type IPty } from "node-pty";
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
  directory: string;
  output: OutputBuffer;
  status: "running" | "exited";
  exitCode: number | null;
  exited: Promise<void>;
  disposables: { dispose(): void }[];
  terminating?: Promise<void>;
};
export class TerminalHost {
  constructor(private readonly directoryRoot = tmpdir()) {}
  private session?: Session;
  private stopped = false;
  private closing = false;
  private inputWindow = 0;
  private inputBytes = 0;

  async execute(raw: TerminalCommand): Promise<TerminalState> {
    const command = terminalCommandSchema.parse(raw);
    if (this.stopped || this.closing) throw new Error("Terminal kapatılıyor.");
    if (command.method === "start") {
      if (process.platform !== "win32")
        throw new Error("ConPTY yalnız Windows'ta kullanılabilir.");
      if (Number(release().split(".")[2]) < 18309)
        throw new Error("Bu Windows sürümünde ConPTY desteklenmiyor.");
      if (this.session?.status === "running")
        throw new Error("Bir terminal zaten açık.");
      this.release();
      const directory = mkdtempSync(
        join(this.directoryRoot, "AjanKatı terminal "),
      );
      try {
        const env: Record<string, string> = {};
        for (const key of ["SystemRoot", "WINDIR", "TEMP", "TMP"])
          if (process.env[key]) env[key] = process.env[key]!;
        const pty = spawn(
          join(__dirname, "../dist/terminal-node.exe"),
          [join(__dirname, "safe-echo.cjs"), String(process.pid)],
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
          directory,
          output: new OutputBuffer(),
          status: "running",
          exitCode: null,
          exited: new Promise<void>((resolve) => {
            exited = resolve;
          }),
          disposables: [],
        };
        session.disposables.push(
          pty.onData((data) => session.output.append(data)),
          pty.onExit((event) => {
            session.status = "exited";
            session.exitCode = event.exitCode;
            exited();
          }),
        );
        this.session = session;
        this.inputBytes = 0;
        this.inputWindow = Date.now();
        return this.state(session, 0);
      } catch (error) {
        rmSync(directory, { recursive: true, force: true });
        throw error;
      }
    }
    const session = this.session;
    if (!session || session.id !== command.payload.sessionId)
      throw new Error("Terminal sahipliği geçersiz.");
    if (command.method === "read")
      return this.state(session, command.payload.cursor);
    if (command.method === "close") {
      this.closing = true;
      await this.terminate(session);
      this.closing = false;
      return this.state(session, 0);
    }
    if (session.status !== "running") throw new Error("Terminal sonlandı.");
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
    session.terminating ??= this.finish(session);
    return session.terminating;
  }
  private async finish(session: Session) {
    if (session.status === "running") {
      session.pty.write("\u0003");
      let grace: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        session.exited,
        new Promise<void>((resolve) => {
          grace = setTimeout(resolve, 2000);
        }),
      ]);
      clearTimeout(grace);
      if (session.status === "running") session.pty.kill();
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
    rmSync(session.directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
  private release() {
    if (!this.session) return;
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
