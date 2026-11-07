// Synthetic IPC peer that ignores graceful disconnect. No shell, provider or subprocess.
process.send({ type: "worker.ready", version: 1 });
setInterval(() => {}, 1000);
process.on("disconnect", () => {});
