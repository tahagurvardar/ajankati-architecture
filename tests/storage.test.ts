import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../packages/storage/src/index";
const dirs: string[] = [];
const stores: Store[] = [];
function open(path?: string) {
  const dir = mkdtempSync(join(tmpdir(), "ajankati-test-"));
  dirs.push(dir);
  const s = new Store(path ?? join(dir, "data.sqlite"));
  stores.push(s);
  return s;
}
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
describe("SQLite transactional workflow", () => {
  it("migrates once and preserves projects, tasks and events after reopening", () => {
    const s = open();
    const p = s.createProject("Türkçe proje");
    const t = s.createTask(p.id, "İlk görev");
    const file = s.filename;
    s.close();
    const reopened = open(file);
    expect(reopened.snapshot().projects).toEqual([p]);
    expect(reopened.getTask(t.id)).toEqual(t);
    expect(reopened.snapshot().events).toHaveLength(2);
    expect(reopened.schemaVersion()).toBe(1);
  });
  it("rejects orphan tasks and stale revisions without writing events", () => {
    const s = open();
    expect(() => s.createTask("missing", "görev")).toThrow();
    const p = s.createProject("p");
    const t = s.createTask(p.id, "g");
    const ready = s.transition(t.id, 0, "ready");
    expect(() => s.startRun(t.id, 0)).toThrow();
    expect(s.getTask(t.id)).toEqual(ready);
    expect(s.snapshot().events).toHaveLength(3);
  });
  it("requires a matching mock result hash for human acceptance", () => {
    const s = open();
    const p = s.createProject("p");
    let t = s.createTask(p.id, "g");
    t = s.transition(t.id, t.revision, "ready");
    t = s.startRun(t.id, t.revision);
    const run = t.runId!;
    expect(() => s.accept(t.id, t.revision, "missing")).toThrow();
    t = s.completeRun(t.id, run, "Demo — gerçek ajan çalışmıyor");
    expect(t.status).toBe("awaiting_review");
    expect(t.resultHash).toHaveLength(64);
    expect(() => s.accept(t.id, t.revision, "wrong")).toThrow();
    const done = s.accept(t.id, t.revision, t.resultHash!);
    expect(done.status).toBe("succeeded");
  });
  it("prevents late completion from reviving a cancelled task", () => {
    const s = open();
    const p = s.createProject("p");
    let t = s.createTask(p.id, "g");
    t = s.transition(t.id, 0, "ready");
    t = s.startRun(t.id, t.revision);
    const run = t.runId!;
    s.transition(t.id, t.revision, "cancelled");
    expect(() => s.completeRun(t.id, run, "late")).toThrow();
    expect(s.getTask(t.id).status).toBe("cancelled");
  });
  it("recovers running tasks as interrupted, never automatically replays", () => {
    const s = open();
    const p = s.createProject("p");
    const t = s.createTask(p.id, "g");
    const ready = s.transition(t.id, 0, "ready");
    s.startRun(t.id, ready.revision);
    const file = s.filename;
    s.close();
    const reopened = open(file);
    reopened.recover();
    expect(reopened.getTask(t.id).status).toBe("interrupted");
  });
});
