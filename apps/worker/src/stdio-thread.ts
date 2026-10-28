import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import { join } from "node:path";
import { runStdioOwner, type NativeStdio } from "./stdio-io";

if (!parentPort || typeof workerData !== "string")
  throw new Error("INVALID_PROFILE");
const native = createRequire(__filename)(
  join(__dirname, "stdio_owner.node"),
) as NativeStdio;
runStdioOwner(native, workerData, parentPort);
