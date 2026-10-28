import { createRequire } from "node:module";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export interface DiagnosticJob {
  name: string;
  active(): number;
  terminate(): void;
  close(): void;
  members(): { pid: number; image: string }[];
}
type NativeJobs = {
  create(name: string): object;
  active(handle: object): number;
  terminate(handle: object): void;
  close(handle: object): void;
  members(handle: object): { pid: number; image: string }[];
};
export function createDiagnosticJob(): DiagnosticJob {
  // Lazy: Linux never loads a Windows addon. Node-API works in Node and Electron.
  const native = createRequire(join(__dirname, "job-owner.cjs"))(
    join(__dirname, "../dist/job_owner.node"),
  ) as NativeJobs;
  const name = `Local\\AjanKati-${randomUUID()}`;
  const handle = native.create(name);
  return {
    name,
    active: () => native.active(handle),
    terminate: () => native.terminate(handle),
    close: () => native.close(handle),
    members: () => native.members(handle),
  };
}
