import { createRequire } from "node:module";
import { join } from "node:path";
import { managedWindowsPathSchema } from "@ajankati/contracts";

export type NativePathIdentity = Readonly<{
  finalPath: string;
  volumeSerial: string;
  fileId: string;
}>;
type Boundary = {
  open(path: string, directory: boolean): object;
  snapshot(owner: object): NativePathIdentity;
  close(owner: object): void;
};

/** Internal synchronous lease: evidence is generated here, never accepted from IPC.
 * No handle is serialized. Reopening a saved path is not continuation of a lease. */
export function withNativePath<T>(
  path: string,
  directory: boolean,
  inspect: (identity: NativePathIdentity) => T,
): T {
  managedWindowsPathSchema.parse(path);
  if (process.platform !== "win32")
    throw new Error("Windows inspection required");
  const native = createRequire(join(__dirname, "native-path-boundary.cjs"))(
    join(__dirname, "../dist/path_boundary.node"),
  ) as Boundary;
  const owner = native.open(path, directory);
  try {
    const before = native.snapshot(owner);
    const result = inspect(Object.freeze(before));
    if (JSON.stringify(native.snapshot(owner)) !== JSON.stringify(before))
      throw new Error("Native identity changed");
    return result;
  } finally {
    native.close(owner);
  }
}
