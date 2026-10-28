// Fixed diagnostic program. Only :tree starts a fixed, harmless nested fixture.
const { spawn } = require("node:child_process");
const { join } = require("node:path");
let tree;
if (!process.stdin.isTTY || !process.stdout.isTTY) process.exit(2);
process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
process.stdout.write(`READY Türkçe ConPTY\r\nCWD:${process.cwd()}\r\n`);
let line = "";
let hold = false;
let escapeState = 0;
let escapeLength = 0;
process.stdin.on("data", (data) => {
  for (const char of data) {
    // ConPTY capability queries can be answered by xterm after READY. Consume
    // bounded VT control replies across chunks so they cannot prefix user text.
    if (char === "\u001b") {
      escapeState = 1;
      escapeLength = 0;
      continue;
    }
    if (escapeState === 1) {
      escapeState = char === "[" ? 2 : 0;
      continue;
    }
    if (escapeState === 2) {
      if (++escapeLength >= 64 || (char >= "@" && char <= "~")) escapeState = 0;
      continue;
    }
    if (char === "\u0003") {
      if (hold) continue;
      process.stdout.write("INTERRUPTED\r\n", () => process.exit(130));
      return;
    }
    if (char === "\r" || char === "\n") {
      // Bound this diagnostic producer too, including many :flood lines in one paste.
      if (process.stdout.writableLength > 65536) {
        line = "";
        continue;
      }
      if (line === ":exit") {
        process.stdout.write("BYE\r\n", () => process.exit(0));
        return;
      }
      if (line === ":hold") {
        hold = true;
        line = "";
        process.stdout.write("HOLDING\r\n");
        continue;
      }
      if (line === ":size") {
        // Windows does not always refresh Node's cached stdout.columns after a ConPTY resize.
        // Pinned Node 24 diagnostic hook; reuse the handle rather than allocating
        // a new WriteStream for every :size request.
        process.stdout._refreshSize();
        const [cols, rows] = process.stdout.getWindowSize();
        process.stdout.write(`SIZE:${cols}x${rows}\r\n`);
      } else if (line === ":tree") {
        if (!tree) {
          tree = spawn(
            process.execPath,
            [join(__dirname, "diagnostic-tree.cjs"), "branch"],
            {
              shell: false,
              windowsHide: true,
              stdio: ["ignore", "pipe", "ignore"],
            },
          );
          tree.stdout.on("data", (data) => process.stdout.write(data));
          tree.on("error", () => process.stdout.write("TREE-FAILED\r\n"));
        }
      } else if (line === ":flood")
        process.stdout.write("F".repeat(3 * 1024 * 1024) + "\r\nFLOOD-END\r\n");
      else process.stdout.write(`ECHO:${line}\r\n`);
      line = "";
    } else if (char === "\u007f" || char === "\b") line = line.slice(0, -1);
    else if (char >= " " && line.length < 4096) line += char;
  }
});
// Worker-owned Job Object is the crash safety mechanism; no PID liveness check.
setTimeout(() => process.exit(0), 5 * 60 * 1000);
