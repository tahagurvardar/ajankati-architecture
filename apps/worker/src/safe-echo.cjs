// Fixed diagnostic program. Never evaluates input, opens files, networks or children.
const owner = Number(process.argv[2]);
if (
  !process.stdin.isTTY ||
  !process.stdout.isTTY ||
  !Number.isSafeInteger(owner)
)
  process.exit(2);
process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
process.stdout.write(`READY Türkçe ConPTY\r\nCWD:${process.cwd()}\r\n`);
let line = "";
let hold = false;
process.stdin.on("data", (data) => {
  for (const char of data) {
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
      } else if (line === ":flood")
        process.stdout.write("F".repeat(3 * 1024 * 1024) + "\r\nFLOOD-END\r\n");
      else process.stdout.write(`ECHO:${line}\r\n`);
      line = "";
    } else if (char === "\u007f" || char === "\b") line = line.slice(0, -1);
    else if (char >= " " && line.length < 4096) line += char;
  }
});
// Diagnostic-only safety net for abrupt worker loss; not a general Job Object substitute.
setInterval(() => {
  try {
    process.kill(owner, 0);
  } catch {
    process.exit(0);
  }
}, 500);
setTimeout(() => process.exit(0), 5 * 60 * 1000);
