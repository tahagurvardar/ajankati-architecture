import { taskStatusSchema, type TaskStatus } from "@ajankati/contracts";
const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
  draft: ["ready", "cancelled"],
  ready: ["running", "cancelled"],
  running: ["awaiting_review", "failed", "cancelled", "interrupted"],
  awaiting_review: ["succeeded", "cancelled"],
  interrupted: ["ready", "cancelled"],
  failed: ["ready", "cancelled"],
  cancelled: [],
  succeeded: [],
};
export function assertTransition(from: string, to: string): void {
  const source = taskStatusSchema.parse(from);
  const target = taskStatusSchema.parse(to);
  if (!transitions[source].includes(target))
    throw new Error("Geçersiz görev geçişi.");
}
