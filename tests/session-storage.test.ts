import { afterEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readdirSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/storage/src/index";
import type { SessionUsage } from "../packages/contracts/src/index";
const dirs: string[] = [];
const stores: Store[] = [];
function setup() {
  const dir = mkdtempSync(join(tmpdir(), "ak-ledger-"));
  dirs.push(dir);
  const file = join(dir, "data.sqlite");
  const store = new Store(file);
  stores.push(store);
  return { dir, file, store };
}
function open(file: string) {
  const s = new Store(file);
  stores.push(s);
  return s;
}
afterEach(() => {
  stores.splice(0).forEach((s) => s.close());
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});
export function usage(projectId: string): SessionUsage {
  return {
    sessionId: "s",
    runId: "r",
    projectId,
    provider: "codex",
    source: "fixture",
    cliVersion: "fixture-0.164.0",
    cliIdentity: "fixture",
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationMs: null,
    status: "starting",
    retryCount: 0,
    threadId: null,
    turnId: null,
    totalTokens: null,
    tokenSource: null,
    cost: "UNKNOWN",
    quota: "UNKNOWN",
    reason: "NONE",
  };
}
it("migrates v1 with a consistent backup and preserves tasks; backup restores independently", () => {
  const { store, dir, file } = setup();
  const p = store.createProject("Türkçe");
  store.createTask(p.id, "koru");
  const before = store.snapshot();
  store.close();
  const old = new DatabaseSync(file);
  old.exec("DROP TABLE IF EXISTS sessions; PRAGMA user_version=1");
  old.close();
  const migrated = open(file);
  expect(migrated.schemaVersion()).toBe(2);
  expect(migrated.snapshot()).toEqual(before);
  const backups = readdirSync(dir).filter((f) => f.includes("backup-v1-"));
  expect(backups).toHaveLength(1);
  const restored = join(dir, "restored.sqlite");
  copyFileSync(join(dir, backups[0]!), restored);
  expect(open(restored).snapshot()).toEqual(before);
});
it("persists metadata only, rejects concurrent sessions and recovers without invented end time or replay", () => {
  const { store, file } = setup();
  const p = store.createProject("p");
  const row = usage(p.id);
  expect(store).toHaveProperty("saveSession");
  store.saveSession(row);
  expect(() =>
    store.saveSession({ ...row, sessionId: "s2", runId: "r2" }),
  ).toThrow();
  expect(() =>
    store.saveSession({ ...row, prompt: "secret" } as SessionUsage),
  ).toThrow();
  store.close();
  const recovered = open(file);
  recovered.recover();
  expect(recovered.sessions()[0]).toMatchObject({
    status: "interrupted",
    reason: "WORKER_RESTART",
    endedAt: null,
    durationMs: null,
    totalTokens: null,
    cost: "UNKNOWN",
  });
  recovered.recover();
  expect(recovered.sessions()).toHaveLength(1);
  expect(() =>
    recovered.saveSession({ ...row, sessionId: "new", runId: "new" }),
  ).toThrow();
});
it("rolls back failed migration and keeps the original database and backup", () => {
  const { store, dir, file } = setup();
  const before = store.createProject("keep");
  store.close();
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE IF NOT EXISTS sessions(x); PRAGMA user_version=1");
  db.close();
  expect(() => new Store(file)).toThrow();
  const check = new DatabaseSync(file);
  expect(check.prepare("PRAGMA user_version").get()?.user_version).toBe(1);
  expect(
    check.prepare("SELECT name FROM projects WHERE id=?").get(before.id)?.name,
  ).toBe("keep");
  check.close();
  expect(readdirSync(dir).some((f) => f.includes("backup-v1-"))).toBe(true);
});
