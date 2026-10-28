const { parentPort, workerData } = require("node:worker_threads");
const { runStdioOwner } = require("../../apps/worker/dist/stdio-io.cjs");
const native = require("../../apps/worker/native/build/Release/stdio_owner_test.node");
runStdioOwner(native, workerData, parentPort);
