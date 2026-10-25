import { parseRequest, type Response } from "@ajankati/contracts";
import type { Store } from "@ajankati/storage";
import type { AgentAdapter } from "@ajankati/adapters";

export class WorkerService {
  private active:
    | { controller: AbortController; promise: Promise<void>; taskId: string }
    | undefined;
  private stopped = false;
  constructor(
    private store: Store,
    private adapter: AgentAdapter,
  ) {
    // Real executors must not be enabled until policy/sandbox/CLI milestones pass.
    if (adapter.kind !== "mock-agent")
      throw new Error("Bu sürüm yalnız demo ajanını destekler.");
  }
  async handle(input: unknown): Promise<Response> {
    let request;
    try {
      request = parseRequest(input);
    } catch {
      return {
        version: 1,
        requestId: "invalid",
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "İstek sürümü, yöntemi veya alanları geçersiz.",
        },
      };
    }
    const { requestId, method, payload } = request;
    if (this.stopped)
      return {
        version: 1,
        requestId,
        ok: false,
        error: { code: "UNAVAILABLE", message: "İşçi kapatılıyor." },
      };
    try {
      switch (method) {
        case "snapshot":
          break;
        case "project.create":
          this.store.createProject(payload.name);
          break;
        case "task.create":
          this.store.createTask(payload.projectId, payload.title);
          break;
        case "task.ready":
          this.store.transition(payload.taskId, payload.revision, "ready");
          break;
        case "task.cancel":
          this.store.transition(payload.taskId, payload.revision, "cancelled");
          if (this.active?.taskId === payload.taskId)
            this.active.controller.abort();
          break;
        case "task.accept":
          this.store.accept(
            payload.taskId,
            payload.revision,
            payload.resultHash,
          );
          break;
        case "task.run": {
          if (this.active) throw new Error("Çalışan görev var.");
          const task = this.store.startRun(payload.taskId, payload.revision);
          const controller = new AbortController();
          const promise = this.adapter
            .execute(
              { taskId: task.id, runId: task.runId!, title: task.title },
              controller.signal,
            )
            .then((result) => {
              if (!controller.signal.aborted)
                this.store.completeRun(task.id, task.runId!, result.text);
            })
            .catch(() => {
              this.store.failRun(task.id, task.runId!);
            })
            .finally(() => {
              this.active = undefined;
            });
          this.active = { controller, promise, taskId: task.id };
          break;
        }
      }
      return { version: 1, requestId, ok: true, data: this.store.snapshot() };
    } catch {
      return {
        version: 1,
        requestId,
        ok: false,
        error: {
          code: "CONFLICT",
          message:
            "İşlem uygulanamadı. Görev durumunu, revizyonu ve kayıt sınırlarını kontrol edin.",
        },
      };
    }
  }
  async idle(): Promise<void> {
    await this.active?.promise;
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.active) {
      const task = this.store.getTask(this.active.taskId);
      if (task.status === "running")
        this.store.transition(task.id, task.revision, "interrupted");
      this.active.controller.abort();
      await this.active.promise;
    }
  }
}
