// Fixed harmless nested fixture. No input, files, network, PID watchdog or shell.
const { spawn } = require("node:child_process");
if (process.argv[2] === "branch") {
  const leaf = spawn(process.execPath, [__filename, "leaf"], {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
  leaf.stdout.once("data", () =>
    process.stdout.write(`TREE:${process.pid}:${leaf.pid}\n`),
  );
} else if (process.argv[2] === "leaf") process.stdout.write("LEAF\n");
else process.exit(2);
// Emergency test fixture ceiling, deliberately far beyond cleanup assertions.
setTimeout(() => process.exit(0), 5 * 60 * 1000);
