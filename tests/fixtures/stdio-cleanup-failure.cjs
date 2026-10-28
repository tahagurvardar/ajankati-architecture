const native = require("../../apps/worker/native/build/Release/stdio_owner_test.node");
const owner = native.open(process.cwd(), "cleanup-failure");
setTimeout(() => {
  const before = native.snapshot(owner);
  const cleaned = native.stop(owner);
  try {
    native.close(owner);
  } catch {
    /* failure is expected and must be explicit */
  }
  let rejected = false;
  try {
    native.open(process.cwd());
  } catch {
    rejected = true;
  }
  process.send({ members: before.members, cleaned, rejected });
  process.disconnect();
}, 300);
