import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  symlinkSync,
  readdirSync,
  copyFileSync,
  linkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../packages/storage/src/index";
import * as contracts from "../packages/contracts/src/index";

const dirs: string[] = [];
const stores: Store[] = [];
afterEach(() => {
  stores.splice(0).forEach((s) => s.close());
  dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

// First RED is an assertion on the missing public contract, not an import error.
it("provides a strict managed-task contract separate from mock task.run", () => {
  expect(contracts).toHaveProperty("managedPlanSchema");
});

// Pure path-schema rejection is portable; real Windows file identity and junction
// fixtures must run only on win32, where their filesystem semantics are valid.
it.each([
  "C:relative",
  "\\\\?\\C:\\root",
  "\\\\server\\share",
  "C:\\root\\..\\other",
  "C:\\root:ads",
  "C:\\root\\NUL.txt",
  "C:\\root\\bad.",
  "C:\\root\\e\u0301",
])("rejects unsafe Windows identity %s", (path) => {
  expect(contracts.managedWindowsPathSchema.safeParse(path).success).toBe(
    false,
  );
});

describe.runIf(process.platform === "win32")("offline managed preflight", () => {
  async function setup() {
    const { ManagedPreflight } = await import(
      "../apps/worker/src/managed-preflight"
    );
    const dir = mkdtempSync(join(tmpdir(), "ak-preflight-"));
    dirs.push(dir);
    const workspace = join(dir, "Türkçe proje");
    mkdirSync(workspace);
    writeFileSync(join(workspace, "README.md"), "approved content");
    const executable = join(dir, "fixture.exe");
    writeFileSync(executable, "offline fixture; never executable");
    const store = new Store(join(dir, "data.sqlite"));
    stores.push(store);
    const project = store.createProject("p");
    const task = store.createTask(project.id, "Read README");
    store.transition(task.id, task.revision, "ready");
    const host = new ManagedPreflight(store);
    const plan = host.prepare({
      taskId: task.id,
      workspace,
      executable,
      scope: ["README.md"],
    });
    const decision = {
      approvalId: "human-1",
      planId: plan.planId,
      actionDigest: plan.actionDigest,
      runId: plan.runId,
      policyVersion: plan.policyVersion,
      expiresAt: plan.expiresAt,
      decision: "approve-once",
      decidedAt: plan.createdAt,
      actor: "local-human",
    };
    return { dir, workspace, executable, store, host, plan, decision, task };
  }

  it("freezes every nested plan and does not grant execution from human consent", async () => {
    const { host, plan, decision } = await setup();
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.workspace)).toBe(true);
    expect(Object.isFrozen(plan.scope)).toBe(true);
    host.decide(decision);
    const status = host.inspect(plan.planId);
    expect(status.executionAllowed).toBe(false);
    expect(status.gates.plan).toBe("verified");
    expect(status.gates.approval).toBe("verified");
    expect(status.gates.sandboxFilesystem).toBe("unknown");
    expect(status.gates.sandboxNetwork).toBe("unknown");
    expect(status.gates.toolGate).toBe("unknown");
    expect(status.gates.nativePathBoundary).toBe("unknown");
    expect(() => host.authorizeExecution(plan.planId)).toThrow();
    expect(() => host.decide(decision)).toThrow();
  });

  it("rejects a changed executable, workspace identity, task revision and injected evidence", async () => {
    const { host, plan, decision, executable, workspace, store, task } =
      await setup();
    expect(() => host.decide({ ...decision, sandbox: "verified" })).toThrow();
    host.decide(decision);
    writeFileSync(executable, "replacement");
    expect(host.inspect(plan.planId).gates.executable).toBe("failed");
    rmSync(workspace, { recursive: true });
    mkdirSync(workspace);
    expect(host.inspect(plan.planId).gates.workspace).toBe("failed");
    store.transition(task.id, 1, "cancelled");
    expect(host.inspect(plan.planId).gates.task).toBe("failed");
  });

  it.each(["actionDigest", "runId", "policyVersion", "planId"])(
    "rejects mismatched %s without recording consent",
    async (field) => {
      const { host, plan, decision } = await setup();
      expect(() =>
        host.decide({ ...decision, [field]: "0".repeat(64) }),
      ).toThrow();
      expect(host.inspect(plan.planId).gates.approval).toBe("unknown");
    },
  );

  it("rejects expired decisions and clock rollback", async () => {
    const { store, plan, decision } = await setup();
    expect(() => store.managed.decide(decision, plan.expiresAt)).toThrow();
    expect(() => store.managed.decide(decision, plan.createdAt - 1)).toThrow();
    expect(() =>
      store.managed.decide(
        { ...decision, expiresAt: plan.expiresAt + 1 },
        plan.createdAt,
      ),
    ).toThrow();
  });

  it("consumes consent once for offline review and retains ownership across recovery", async () => {
    const { store, plan, decision } = await setup();
    store.managed.decide(decision, plan.createdAt);
    store.managed.consumeOfflineReview(
      plan.planId,
      decision.approvalId,
      plan.actionDigest,
      plan.createdAt,
    );
    expect(() =>
      store.managed.consumeOfflineReview(
        plan.planId,
        decision.approvalId,
        plan.actionDigest,
        plan.createdAt,
      ),
    ).toThrow();
    store.close();
    const reopened = new Store(store.filename);
    stores.push(reopened);
    reopened.recover();
    expect(() =>
      reopened.managed.consumeOfflineReview(
        plan.planId,
        decision.approvalId,
        plan.actionDigest,
        plan.createdAt,
      ),
    ).toThrow();
    expect(reopened.managed.state(plan.planId)).toBe("interrupted");
    expect(reopened.managed.ownershipAvailable(plan)).toBe(false);
  });

  it("rolls back consumption when ownership conflicts, including nested workspaces", async () => {
    const { store, host, plan, decision, workspace, executable, task } =
      await setup();
    store.managed.decide(decision, plan.createdAt);
    store.managed.consumeOfflineReview(
      plan.planId,
      decision.approvalId,
      plan.actionDigest,
      plan.createdAt,
    );
    const nested = join(workspace, "child");
    mkdirSync(nested);
    writeFileSync(join(nested, "README.md"), "nested content");
    const next = host.prepare({
      taskId: task.id,
      workspace: nested,
      executable,
      scope: ["README.md"],
    });
    const second = {
      ...decision,
      approvalId: "human-2",
      planId: next.planId,
      runId: next.runId,
      actionDigest: next.actionDigest,
      decidedAt: next.createdAt,
      expiresAt: next.expiresAt,
    };
    store.managed.decide(second, next.createdAt);
    expect(() =>
      store.managed.consumeOfflineReview(
        next.planId,
        second.approvalId,
        next.actionDigest,
        next.createdAt,
      ),
    ).toThrow();
    expect(store.managed.state(next.planId)).toBe("approved");
  });

  it("rolls back approval consumption if the ownership insert fails", async () => {
    const { store, plan, decision } = await setup();
    store.managed.decide(decision, plan.createdAt);
    const db = new DatabaseSync(store.filename);
    db.exec(
      "CREATE TRIGGER fail_owner BEFORE INSERT ON managed_ownership BEGIN SELECT RAISE(ABORT, 'disk failure fixture'); END",
    );
    db.close();
    expect(() =>
      store.managed.consumeOfflineReview(
        plan.planId,
        decision.approvalId,
        plan.actionDigest,
        plan.createdAt,
      ),
    ).toThrow();
    expect(store.managed.state(plan.planId)).toBe("approved");
    expect(store.managed.ownershipAvailable(plan)).toBe(true);
  });

  it("rejects directory junctions without reading their targets", async () => {
    const { host, dir, executable, task } = await setup();
    const alias = join(dir, "junction");
    symlinkSync(dir, alias, "junction");
    expect(() =>
      host.prepare({
        taskId: task.id,
        workspace: alias,
        executable,
        scope: ["README.md"],
      }),
    ).toThrow();
  });

  it("invalidates a plan when an allowed file changes", async () => {
    const { host, plan, workspace } = await setup();
    writeFileSync(join(workspace, "README.md"), "changed instructions");
    expect(host.inspect(plan.planId).gates.workspace).toBe("failed");
  });

  it("rejects junctions within the allowed scope", async () => {
    const { host, dir, workspace, executable, task } = await setup();
    symlinkSync(dir, join(workspace, "escape"), "junction");
    expect(() =>
      host.prepare({
        taskId: task.id,
        workspace,
        executable,
        scope: ["escape/fixture.exe"],
      }),
    ).toThrow();
  });

  it("rejects tampered plans, unbounded expiry, broader operations and duplicate scope", async () => {
    const { store, plan } = await setup();
    expect(() => store.managed.save({ ...plan, planId: "changed" })).toThrow();
    expect(
      contracts.managedPlanSchema.safeParse({
        ...plan,
        expiresAt: plan.createdAt + 300001,
      }).success,
    ).toBe(false);
    expect(
      contracts.managedPlanSchema.safeParse({
        ...plan,
        allowedOperations: ["shell"],
      }).success,
    ).toBe(false);
    expect(
      contracts.managedPlanSchema.safeParse({
        ...plan,
        scope: ["README.md", "readme.md"],
      }).success,
    ).toBe(false);
  });

  it("denial is final and cannot be consumed or changed to approval", async () => {
    const { store, host, plan, decision } = await setup();
    host.decide({ ...decision, decision: "deny" });
    expect(() => host.decide(decision)).toThrow();
    expect(() =>
      store.managed.consumeOfflineReview(
        plan.planId,
        decision.approvalId,
        plan.actionDigest,
      ),
    ).toThrow();
    expect(host.inspect(plan.planId).gates.approval).toBe("failed");
  });

  it("invalidates unused approvals on restart without replay", async () => {
    const { store, plan, decision } = await setup();
    store.managed.decide(decision, plan.createdAt);
    store.recover();
    expect(() =>
      store.managed.consumeOfflineReview(
        plan.planId,
        decision.approvalId,
        plan.actionDigest,
        plan.createdAt,
      ),
    ).toThrow();
  });

  it("worker rechecks files before consuming an offline review and never returns execution permission", async () => {
    const { host, plan, decision, workspace, store } = await setup();
    host.decide(decision);
    writeFileSync(join(workspace, "README.md"), "changed");
    expect(() =>
      host.consumeOfflineReview(
        plan.planId,
        decision.approvalId,
        plan.actionDigest,
      ),
    ).toThrow();
    expect(store.managed.state(plan.planId)).toBe("approved");
    writeFileSync(join(workspace, "README.md"), "approved content");
    const result = host.consumeOfflineReview(
      plan.planId,
      decision.approvalId,
      plan.actionDigest,
    );
    expect(result.executionAllowed).toBe(false);
    expect(store.managed.state(plan.planId)).toBe("consumed");
  });

  it("serializes a competing SQLite writer without partially consuming approval", async () => {
    const { store, plan, decision } = await setup();
    store.managed.decide(decision, plan.createdAt);
    const other = new DatabaseSync(store.filename);
    try {
      other.exec("BEGIN IMMEDIATE");
      expect(() =>
        store.managed.consumeOfflineReview(
          plan.planId,
          decision.approvalId,
          plan.actionDigest,
          plan.createdAt,
        ),
      ).toThrow();
      other.exec("ROLLBACK");
      expect(store.managed.state(plan.planId)).toBe("approved");
      store.managed.consumeOfflineReview(
        plan.planId,
        decision.approvalId,
        plan.actionDigest,
        plan.createdAt,
      );
      expect(store.managed.state(plan.planId)).toBe("consumed");
    } finally {
      other.close();
    }
  });

  it("migrates v2 with a restorable backup and does not rewrite existing task data", async () => {
    const { store, dir } = await setup();
    const snapshot = store.snapshot();
    store.close();
    const db = new DatabaseSync(store.filename);
    db.exec(
      "DROP TABLE managed_ownership; DROP TABLE managed_decisions; DROP TABLE managed_plans; PRAGMA user_version=2",
    );
    db.close();
    const migrated = new Store(store.filename);
    stores.push(migrated);
    expect(migrated.schemaVersion()).toBe(3);
    expect(migrated.snapshot()).toEqual(snapshot);
    const backups = readdirSync(dir).filter((p) => p.includes("backup-v2-"));
    expect(backups).toHaveLength(1);
    const restoredFile = join(dir, "restore.sqlite");
    copyFileSync(join(dir, backups[0]), restoredFile);
    const restored = new Store(restoredFile);
    stores.push(restored);
    expect(restored.snapshot()).toEqual(snapshot);
  });

  it("rolls back failed v2 migration and retains its backup", async () => {
    const { store, dir } = await setup();
    store.close();
    const db = new DatabaseSync(store.filename);
    db.exec("PRAGMA user_version=2");
    db.close();
    expect(() => new Store(store.filename)).toThrow();
    const check = new DatabaseSync(store.filename);
    expect(check.prepare("PRAGMA user_version").get()?.user_version).toBe(2);
    check.close();
    expect(
      readdirSync(dir).filter((p) => p.includes("backup-v2-")),
    ).toHaveLength(1);
  });

  it("rejects hard-linked allowed files", async () => {
    const { host, workspace, executable, task } = await setup();
    linkSync(join(workspace, "README.md"), join(workspace, "alias.md"));
    expect(() =>
      host.prepare({
        taskId: task.id,
        workspace,
        executable,
        scope: ["alias.md"],
      }),
    ).toThrow();
  });

  it.each([
    "../secret",
    "C:\\secret",
    "\\\\server\\share",
    "file:stream",
    "CON",
    "foo.",
    "foo ",
    "a/../b",
    "a//b",
    "a\\b",
    ".codex/auth.json",
  ])("rejects unsafe relative scope %s", async (path) => {
    const { host, workspace, executable, task } = await setup();
    expect(() =>
      host.prepare({ taskId: task.id, workspace, executable, scope: [path] }),
    ).toThrow();
  });
});
