import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  linkSync,
  openSync,
  closeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type Boundary = {
  open(path: string, directory: boolean, checkpoint?: () => void): object;
  snapshot(owner: object): {
    finalPath: string;
    volumeSerial: string;
    fileId: string;
  };
  close(owner: object): void;
  unknownReparse(path: string): void;
  removeUnknownReparse(path: string): void;
  shortPath(path: string): string;
};
const addon = resolve("apps/worker/dist/path_boundary.node");
const load = () => createRequire(import.meta.url)(addon) as Boundary;
const loadTest = () =>
  createRequire(import.meta.url)(
    resolve("apps/worker/native/build/Release/path_boundary_test.node"),
  ) as Boundary;
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), "ak-boundary-"));
  dirs.push(root);
  const dir = join(root, "Türkçe directory");
  mkdirSync(dir);
  const file = join(dir, "approved.txt");
  writeFileSync(file, "approved bytes");
  return { root, dir, file };
}
describe.runIf(process.platform === "win32")("native path boundary", () => {
  it("ships a native handle inspection boundary", () =>
    expect(existsSync(addon)).toBe(true));
  it("retains file and ancestors against replacement until explicit close", () => {
    const { dir, file } = fixture();
    const native = load();
    const owner = native.open(file, false);
    try {
      const snap = native.snapshot(owner);
      expect(snap.finalPath).toBe(file);
      expect(snap.volumeSerial).toMatch(/^\d+$/);
      expect(snap.fileId).toMatch(/^[0-9a-f]{32}$/);
      expect(() => renameSync(file, file + ".old")).toThrow();
      expect(() => renameSync(dir, dir + ".old")).toThrow();
      expect(() => writeFileSync(file, "substitution")).toThrow();
      expect(native.snapshot(owner)).toEqual(snap);
    } finally {
      native.close(owner);
    }
    renameSync(file, file + ".old");
    writeFileSync(file, "approved bytes");
    const next = native.open(file, false);
    try {
      expect(native.snapshot(next).finalPath).toBe(file);
    } finally {
      native.close(next);
    }
    expect(() => native.snapshot(owner)).toThrow();
    native.close(owner);
  });
  it("detects same-content identity substitution after a lease ends", () => {
    const { file } = fixture();
    const native = load();
    const first = native.open(file, false);
    const before = native.snapshot(first);
    native.close(first);
    renameSync(file, file + ".old");
    writeFileSync(file, "approved bytes");
    const second = native.open(file, false);
    try {
      expect(native.snapshot(second).fileId).not.toBe(before.fileId);
    } finally {
      native.close(second);
    }
  });
  it("fails closed with a pre-existing writer and releases ancestors on failure", () => {
    const { dir, file } = fixture();
    const fd = openSync(file, "r+");
    try {
      expect(() => load().open(file, false)).toThrow();
    } finally {
      closeSync(fd);
    }
    renameSync(dir, dir + ".old");
  });
  it("rejects junctions at the leaf and at an ancestor", () => {
    const { root, dir } = fixture();
    const alias = join(root, "escape");
    symlinkSync(dir, alias, "junction");
    expect(() => load().open(alias, true)).toThrow();
    expect(() => load().open(join(alias, "approved.txt"), false)).toThrow();
  });
  it("rejects a real unsupported reparse tag", () => {
    const { dir } = fixture();
    const native = loadTest();
    const unknown = join(dir, "unsupported");
    mkdirSync(unknown);
    native.unknownReparse(unknown);
    try {
      expect(() => load().open(unknown, true)).toThrow(
        "Path boundary rejected",
      );
    } finally {
      native.removeUnknownReparse(unknown);
    }
  });
  it("rejects a symlink without following its target", (context) => {
    const { dir, file } = fixture();
    const alias = join(dir, "symbolic.txt");
    try {
      symlinkSync(file, alias, "file");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM")
        context.skip("Windows account cannot create file symlinks (EPERM)");
      throw error;
    }
    expect(() => load().open(alias, false)).toThrow("Path boundary rejected");
  });
  it("rejects available DOS short-name aliases", (context) => {
    const { file } = fixture();
    const alias = loadTest().shortPath(file);
    // Some volumes disable 8.3 generation; absence is not evidence of alias rejection.
    if (alias.toLowerCase() === file.toLowerCase())
      context.skip("Volume has no 8.3 alias for this fixture");
    expect(() => load().open(alias, false)).toThrow("Path boundary rejected");
  });
  it("rejects junction substitution immediately before leaf acquisition", () => {
    const { root, dir } = fixture();
    const victim = join(dir, "victim");
    mkdirSync(victim);
    expect(() =>
      loadTest().open(victim, true, () => {
        renameSync(victim, victim + ".old");
        symlinkSync(root, victim, "junction");
      }),
    ).toThrow("Path boundary rejected");
  });
  it("rejects hard links, wrong types and forged owners", () => {
    const { dir, file } = fixture();
    const native = load();
    expect(() => native.open(file, true)).toThrow();
    expect(() => native.open(dir, false)).toThrow();
    linkSync(file, file + ".link");
    expect(() => native.open(file, false)).toThrow();
    expect(() => native.snapshot({})).toThrow();
    expect(() => native.close({})).toThrow();
  });
  it.each([
    "C:relative",
    "\\\\?\\C:\\root",
    "\\\\server\\share",
    "C:\\root\\..\\other",
    "C:\\root:ads",
    "C:\\root\\NUL.txt",
    "C:\\root\\bad.",
    "C:\\root\\.ssh\\key",
    "C:\\root\\bad\0name",
  ])("rejects native unsafe input %s", (path) => {
    expect(() => load().open(path, false)).toThrow();
  });
});
