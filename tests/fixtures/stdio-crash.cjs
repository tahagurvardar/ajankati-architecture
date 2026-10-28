const native = require("../../apps/worker/native/build/Release/stdio_owner_test.node");
const owner = native.open(process.cwd(), process.argv[2], process.argv[3]);
if (process.argv[2] === "pending-write") {
  native.write(owner, Buffer.from("stall\n"));
  setTimeout(() => {
    for (let i = 0; i < 8; i++) native.write(owner, Buffer.alloc(65536, 65));
  }, 100);
}
