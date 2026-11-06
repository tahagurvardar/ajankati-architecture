// Synthetic IPC peer only: no shell, provider, credentials or subprocesses.
const mode = process.argv[2];
if (mode === "before-ready")
  process.send({
    protocol: "human-cli",
    version: 1,
    requestId: "early",
    ok: false,
    error: "early",
  });
else process.send({ type: "worker.ready", version: 1 });
process.on("disconnect", () => process.exit(0));
process.on("message", (request) => {
  if (mode === "duplicate-ready") {
    process.send({ type: "worker.ready", version: 1 });
    return;
  }
  if (mode === "disconnect") {
    process.disconnect();
    return;
  }
  if (mode === "timeout") return;
  if (mode === "oversize") {
    process.send({ text: "x".repeat(300000) });
    return;
  }
  if (mode === "malformed") {
    process.send({
      protocol: "human-cli",
      version: 1,
      requestId: request.requestId,
      ok: true,
      data: {},
    });
    return;
  }
  process.send({
    protocol: "agents",
    version: 1,
    requestId: request.requestId,
    ok: true,
    data: { integrations: [] },
  });
});
