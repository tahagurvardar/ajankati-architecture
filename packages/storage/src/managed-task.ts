import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  managedPlanSchema,
  managedPlanBodySchema,
  managedDecisionSchema,
  type ManagedPlan,
  type ManagedDecision,
  type Task,
} from "@ajankati/contracts";

export const managedMigration = `
CREATE TABLE managed_plans (
 planId TEXT PRIMARY KEY, runId TEXT NOT NULL UNIQUE,
 taskId TEXT NOT NULL REFERENCES tasks(id), body TEXT NOT NULL CHECK(json_valid(body)),
 state TEXT NOT NULL CHECK(state IN ('pending','approved','denied','consumed','interrupted'))
);
CREATE TABLE managed_decisions (
 approvalId TEXT PRIMARY KEY, planId TEXT NOT NULL UNIQUE REFERENCES managed_plans(planId),
 body TEXT NOT NULL CHECK(json_valid(body)), consumed INTEGER NOT NULL DEFAULT 0 CHECK(consumed IN (0,1))
);
CREATE TABLE managed_ownership (
 planId TEXT PRIMARY KEY REFERENCES managed_plans(planId), path TEXT NOT NULL,
 device TEXT NOT NULL, fileId TEXT NOT NULL
);
PRAGMA user_version=3;
`;

// Canonical JSON for this closed, integer/string/array/object schema. Arrays retain
// order; object keys sort by UTF-16 code unit. No Unicode normalization of content.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
export function taskDigest(task: Task): string {
  return createHash("sha256")
    .update(
      canonical({
        projectId: task.projectId,
        taskId: task.id,
        title: task.title,
        revision: task.revision,
      }),
    )
    .digest("hex");
}
export function sealManagedPlan(input: unknown): ManagedPlan {
  const body = managedPlanBodySchema.parse(input);
  const actionDigest = createHash("sha256")
    .update("ajankati-managed-plan-v1\n" + canonical(body))
    .digest("hex");
  return managedPlanSchema.parse({ ...body, actionDigest });
}
function checked(input: unknown): ManagedPlan {
  const plan = managedPlanSchema.parse(input);
  const { actionDigest, ...body } = plan;
  if (sealManagedPlan(body).actionDigest !== actionDigest)
    throw new Error("Plan digest mismatch");
  return plan;
}

/** Internal worker ledger, sharing Store's connection. Not an execution API or
 * an authenticated human UI. Caller-supplied evidence cannot enable a launcher. */
export class ManagedTaskLedger {
  constructor(
    private db: DatabaseSync,
    private getTask: (id: string) => Task,
  ) {}
  private transaction<T>(body: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = body();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  assertTask(plan: ManagedPlan): void {
    const task = this.getTask(plan.taskId);
    if (
      task.status !== "ready" ||
      task.projectId !== plan.projectId ||
      task.revision !== plan.taskRevision ||
      taskDigest(task) !== plan.taskDigest
    )
      throw new Error("Task changed");
  }
  save(input: unknown): ManagedPlan {
    const plan = checked(input);
    return this.transaction(() => {
      this.assertTask(plan);
      this.db
        .prepare("INSERT INTO managed_plans VALUES(?,?,?,?,'pending')")
        .run(plan.planId, plan.runId, plan.taskId, JSON.stringify(plan));
      return plan;
    });
  }
  get(planId: string): ManagedPlan {
    const row = this.db
      .prepare("SELECT body FROM managed_plans WHERE planId=?")
      .get(planId);
    const plan = checked(JSON.parse(String(row?.body)));
    if (plan.planId !== planId) throw new Error("Plan identity mismatch");
    return plan;
  }
  state(planId: string): string {
    return String(
      this.db
        .prepare("SELECT state FROM managed_plans WHERE planId=?")
        .get(planId)?.state,
    );
  }
  assertTime(plan: ManagedPlan, now: number): void {
    if (
      !Number.isSafeInteger(now) ||
      now < plan.createdAt ||
      now >= plan.expiresAt
    )
      throw new Error("Plan expired or clock regressed");
  }
  private match(
    plan: ManagedPlan,
    decision: ManagedDecision,
    now: number,
  ): void {
    this.assertTime(plan, now);
    if (
      decision.planId !== plan.planId ||
      decision.actionDigest !== plan.actionDigest ||
      decision.runId !== plan.runId ||
      decision.policyVersion !== plan.policyVersion ||
      decision.expiresAt !== plan.expiresAt ||
      decision.decidedAt < plan.createdAt ||
      decision.decidedAt > now
    )
      throw new Error("Decision does not match plan");
  }
  decide(input: unknown, now = Date.now()): void {
    const decision = managedDecisionSchema.parse(input);
    this.transaction(() => {
      const plan = this.get(decision.planId);
      this.match(plan, decision, now);
      this.assertTask(plan);
      if (this.state(plan.planId) !== "pending")
        throw new Error("Decision already made or invalidated");
      this.db
        .prepare(
          "INSERT INTO managed_decisions(approvalId,planId,body) VALUES(?,?,?)",
        )
        .run(decision.approvalId, decision.planId, JSON.stringify(decision));
      this.db
        .prepare("UPDATE managed_plans SET state=? WHERE planId=?")
        .run(
          decision.decision === "approve-once" ? "approved" : "denied",
          plan.planId,
        );
    });
  }
  approvalValid(plan: ManagedPlan, now: number): boolean {
    const row = this.db
      .prepare("SELECT body,consumed FROM managed_decisions WHERE planId=?")
      .get(plan.planId);
    if (!row || row.consumed !== 0 || this.state(plan.planId) !== "approved")
      return false;
    const decision = managedDecisionSchema.parse(JSON.parse(String(row.body)));
    this.match(plan, decision, now);
    return decision.decision === "approve-once";
  }
  ownershipAvailable(plan: ManagedPlan): boolean {
    const target = plan.workspace.path.toLowerCase();
    return !this.db
      .prepare("SELECT path,device,fileId FROM managed_ownership")
      .all()
      .some((row) => {
        const path = String(row.path).toLowerCase();
        return (
          target === path ||
          target.startsWith(path + "\\") ||
          path.startsWith(target + "\\") ||
          (row.device === plan.workspace.device &&
            row.fileId === plan.workspace.fileId)
        );
      });
  }
  /** Consumes consent for OFFLINE review only. Never returns an execution permit.
   * No filesystem/process atomicity is claimed. Retained ownership needs future
   * explicit reconciliation; expiry/restart must not silently release it. */
  consumeOfflineReview(
    planId: string,
    approvalId: string,
    actionDigest: string,
    now = Date.now(),
  ): void {
    this.transaction(() => {
      const plan = this.get(planId);
      this.assertTask(plan);
      if (
        actionDigest !== plan.actionDigest ||
        !this.approvalValid(plan, now) ||
        !this.ownershipAvailable(plan)
      )
        throw new Error("Review blocked");
      const changed = this.db
        .prepare(
          "UPDATE managed_decisions SET consumed=1 WHERE approvalId=? AND planId=? AND consumed=0",
        )
        .run(approvalId, planId);
      if (changed.changes !== 1) throw new Error("Approval replay");
      this.db
        .prepare("INSERT INTO managed_ownership VALUES(?,?,?,?)")
        .run(
          planId,
          plan.workspace.path,
          plan.workspace.device,
          plan.workspace.fileId,
        );
      this.db
        .prepare("UPDATE managed_plans SET state='consumed' WHERE planId=?")
        .run(planId);
    });
  }
  /** Called inside Store.recover's transaction; no nested transaction. */
  recover(): void {
    this.db.exec(
      "UPDATE managed_plans SET state='interrupted' WHERE state IN ('pending','approved','consumed')",
    );
  }
}
