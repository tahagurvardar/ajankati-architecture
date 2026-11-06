import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from "node:fs";
import { win32 } from "node:path";
import { z } from "zod";
import {
  MANAGED_POLICY,
  MAX_PLAN_TTL_MS,
  managedWindowsPathSchema,
  managedRelativePathSchema,
  type ManagedPlan,
  type ManagedPreflightStatus,
} from "@ajankati/contracts";
import type { Store } from "@ajankati/storage";
import {
  withNativePath,
  type NativePathIdentity,
} from "./native-path-boundary";
import {
  sealManagedPlan,
  taskDigest,
} from "../../../packages/storage/src/managed-task";

const preparation = z
  .object({
    taskId: z.string().min(1).max(100),
    workspace: managedWindowsPathSchema,
    executable: managedWindowsPathSchema,
    scope: z.array(managedRelativePathSchema).min(1).max(64),
  })
  .strict();

/** Existing metadata checks remain in addition to the native lease. Neither a
 * persisted snapshot nor a released lease authorizes future IO. The native gate
 * remains unknown until a later consumer and its entire lifetime are proven. */
function inspectPath(input: string, directory: boolean) {
  const path = managedWindowsPathSchema.parse(input);
  if (process.platform !== "win32")
    throw new Error("Windows inspection required");
  let cursor = path;
  while (true) {
    const stat = lstatSync(cursor, { bigint: true });
    if (stat.isSymbolicLink()) throw new Error("Reparse/link path rejected");
    const parent = win32.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  const canonical = realpathSync.native(path);
  if (canonical.toLowerCase() !== path.toLowerCase())
    throw new Error("Path alias rejected");
  const stat = lstatSync(path, { bigint: true });
  if (directory ? !stat.isDirectory() : !stat.isFile())
    throw new Error("Wrong path kind");
  if (!directory && stat.nlink !== 1n)
    throw new Error("Hard-linked file rejected");
  return {
    path: canonical,
    device: String(stat.dev),
    fileId: String(stat.ino),
    birthtimeNs: String(stat.birthtimeNs),
  };
}
function fileIdentity(path: string, limit: number) {
  return withNativePath(path, false, (native) =>
    pinnedFileIdentity(path, limit, native),
  );
}
function pinnedFileIdentity(
  path: string,
  limit: number,
  native: NativePathIdentity,
) {
  const identity = inspectPath(path, false);
  const fd = openSync(path, "r");
  try {
    const stat = fstatSync(fd, { bigint: true });
    if (
      String(stat.dev) !== identity.device ||
      String(stat.ino) !== identity.fileId ||
      String(stat.birthtimeNs) !== identity.birthtimeNs ||
      stat.size > BigInt(limit)
    )
      throw new Error("File changed or exceeds inspection bound");
    const hash = createHash("sha256");
    const buffer = Buffer.alloc(64 * 1024);
    let total = 0;
    let read: number;
    while ((read = readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      total += read;
      if (total > limit) throw new Error("File grew");
      hash.update(buffer.subarray(0, read));
    }
    const after = fstatSync(fd, { bigint: true });
    if (
      after.size !== stat.size ||
      after.mtimeNs !== stat.mtimeNs ||
      after.ctimeNs !== stat.ctimeNs ||
      JSON.stringify(inspectPath(path, false)) !== JSON.stringify(identity)
    )
      throw new Error("Executable changed");
    return { ...identity, native, sha256: hash.digest("hex") };
  } finally {
    closeSync(fd);
  }
}
function executableIdentity(path: string) {
  if (!path.toLowerCase().endsWith(".exe"))
    throw new Error("Only an exact executable is supported");
  return fileIdentity(path, 256 * 1024 * 1024);
}
function workspaceIdentity(path: string, scope: readonly string[]) {
  return withNativePath(path, true, (native) =>
    pinnedWorkspaceIdentity(path, scope, native),
  );
}
function pinnedWorkspaceIdentity(
  path: string,
  scope: readonly string[],
  native: NativePathIdentity,
) {
  const identity = inspectPath(path, true);
  const files = scope.map((relative) =>
    fileIdentity(win32.join(path, ...relative.split("/")), 1024 * 1024),
  );
  const contentDigest = createHash("sha256")
    .update(JSON.stringify(files))
    .digest("hex");
  return { ...identity, native, contentDigest };
}

export function blockedPreflightStatus(): ManagedPreflightStatus {
  return {
    executionAllowed: false,
    gates: {
      plan: "unknown",
      task: "unknown",
      executable: "unknown",
      workspace: "unknown",
      approval: "unknown",
      ownership: "unknown",
      validity: "unknown",
      providerCompatibility: "unknown",
      nativePathBoundary: "unknown",
      sandboxFilesystem: "unknown",
      sandboxNetwork: "unknown",
      toolGate: "unknown",
      sessionIsolation: "unknown",
      processOwnership: "unknown",
      humanApprovalChannel: "unknown",
      liveExecution: "failed",
    },
  };
}

/** Internal offline API. No IPC route accepts paths, decisions or evidence yet.
 * A trusted human channel and inspection-to-execution continuity are future gates. */
export class ManagedPreflight {
  constructor(private store: Store) {}
  prepare(input: unknown): ManagedPlan {
    const request = preparation.parse(input);
    const task = this.store.getTask(request.taskId);
    const now = Date.now();
    const plan = sealManagedPlan({
      version: 1,
      planId: randomUUID(),
      projectId: task.projectId,
      taskId: task.id,
      taskRevision: task.revision,
      taskDigest: taskDigest(task),
      runId: randomUUID(),
      runRevision: 0,
      executable: executableIdentity(request.executable),
      workspace: workspaceIdentity(
        request.workspace,
        [...request.scope].sort(),
      ),
      scope: [...request.scope].sort(),
      allowedOperations: ["read-file"],
      policyVersion: MANAGED_POLICY,
      createdAt: now,
      expiresAt: now + MAX_PLAN_TTL_MS,
    });
    return this.store.managed.save(plan);
  }
  decide(input: unknown): void {
    this.store.managed.decide(input);
  }
  inspect(planId: string): ManagedPreflightStatus {
    const status = blockedPreflightStatus();
    const gate = (
      name: Exclude<keyof ManagedPreflightStatus["gates"], "liveExecution">,
      check: () => boolean,
    ) => {
      try {
        status.gates[name] = check() ? "verified" : "failed";
      } catch {
        status.gates[name] = "failed";
      }
    };
    let plan: ManagedPlan;
    try {
      plan = this.store.managed.get(planId);
      status.gates.plan = "verified";
    } catch {
      status.gates.plan = "failed";
      return status;
    }
    gate("task", () => {
      this.store.managed.assertTask(plan);
      return true;
    });
    gate("validity", () => {
      this.store.managed.assertTime(plan, Date.now());
      return true;
    });
    gate(
      "workspace",
      () =>
        JSON.stringify(workspaceIdentity(plan.workspace.path, plan.scope)) ===
        JSON.stringify(plan.workspace),
    );
    gate(
      "executable",
      () =>
        JSON.stringify(executableIdentity(plan.executable.path)) ===
        JSON.stringify(plan.executable),
    );
    gate("ownership", () => this.store.managed.ownershipAvailable(plan));
    if (this.store.managed.state(planId) !== "pending")
      gate("approval", () =>
        this.store.managed.approvalValid(plan, Date.now()),
      );
    return status;
  }
  consumeOfflineReview(
    planId: string,
    approvalId: string,
    actionDigest: string,
  ): ManagedPreflightStatus {
    const status = this.inspect(planId);
    const gates = [
      "plan",
      "task",
      "executable",
      "workspace",
      "approval",
      "ownership",
      "validity",
    ] as const;
    if (gates.some((gate) => status.gates[gate] !== "verified"))
      throw new Error("Offline review blocked");
    this.store.managed.consumeOfflineReview(planId, approvalId, actionDigest);
    return this.inspect(planId);
  }
  authorizeExecution(planId: string): never {
    this.inspect(planId);
    throw new Error(
      "Live execution disabled: native paths, sandbox, tool gate and human channel remain unverified",
    );
  }
}
