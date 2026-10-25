import { DatabaseSync } from "node:sqlite";
import { randomUUID, createHash } from "node:crypto";
import { assertTransition } from "@ajankati/domain";
import {
  projectSchema,
  taskSchema,
  eventSchema,
  type Project,
  type Task,
  type TaskStatus,
  type Snapshot,
} from "@ajankati/contracts";

const migration1 = `
CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE TABLE tasks (id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id), title TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('draft','ready','running','awaiting_review','succeeded','failed','cancelled','interrupted')),
 revision INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
 runId TEXT, result TEXT, resultHash TEXT, executionMode TEXT NOT NULL CHECK(executionMode='mock'));
CREATE TABLE events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, entityId TEXT NOT NULL, kind TEXT NOT NULL, occurredAt TEXT NOT NULL);
CREATE INDEX tasks_project ON tasks(projectId);
PRAGMA user_version=1;
`;

/** Only the worker owns this connection; never imported by the renderer. */
export class Store {
  private db: DatabaseSync;
  private closed = false;
  constructor(readonly filename: string) {
    this.db = new DatabaseSync(filename);
    try {
      this.db.exec(
        "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=1000;",
      );
      const version = this.schemaVersion();
      if (version > 1) throw new Error("Veritabanı sürümü desteklenmiyor.");
      if (version === 0) this.transaction(() => this.db.exec(migration1));
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  schemaVersion(): number {
    return Number(this.db.prepare("PRAGMA user_version").get()?.user_version);
  }
  close(): void {
    if (!this.closed) {
      this.db.close();
      this.closed = true;
    }
  }
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
  private event(entityId: string, kind: string): void {
    this.db
      .prepare("INSERT INTO events(entityId,kind,occurredAt) VALUES(?,?,?)")
      .run(entityId, kind, new Date().toISOString());
  }
  createProject(name: string): Project {
    const p = projectSchema.parse({
      id: randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    });
    return this.transaction(() => {
      if (
        Number(
          this.db.prepare("SELECT count(*) AS n FROM projects").get()?.n,
        ) >= 25
      )
        throw new Error("Proje sınırı.");
      this.db
        .prepare("INSERT INTO projects VALUES(?,?,?)")
        .run(p.id, p.name, p.createdAt);
      this.event(p.id, "project.created");
      return p;
    });
  }
  createTask(projectId: string, title: string): Task {
    const now = new Date().toISOString();
    const task = taskSchema.parse({
      id: randomUUID(),
      projectId,
      title,
      status: "draft",
      revision: 0,
      createdAt: now,
      updatedAt: now,
      runId: null,
      result: null,
      resultHash: null,
      executionMode: "mock",
    });
    return this.transaction(() => {
      if (
        Number(this.db.prepare("SELECT count(*) AS n FROM tasks").get()?.n) >=
        50
      )
        throw new Error("Görev sınırı.");
      this.db
        .prepare("INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          task.id,
          task.projectId,
          task.title,
          task.status,
          0,
          now,
          now,
          null,
          null,
          null,
          "mock",
        );
      this.event(task.id, "task.created");
      return task;
    });
  }
  getTask(id: string): Task {
    return taskSchema.parse(
      this.db.prepare("SELECT * FROM tasks WHERE id=?").get(id),
    );
  }
  private update(
    task: Task,
    target: TaskStatus,
    patch: Partial<Task> = {},
  ): Task {
    assertTransition(task.status, target);
    const next = taskSchema.parse({
      ...task,
      ...patch,
      status: target,
      revision: task.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    const result = this.db
      .prepare(
        "UPDATE tasks SET status=?,revision=?,updatedAt=?,runId=?,result=?,resultHash=? WHERE id=? AND revision=?",
      )
      .run(
        next.status,
        next.revision,
        next.updatedAt,
        next.runId,
        next.result,
        next.resultHash,
        next.id,
        task.revision,
      );
    if (result.changes !== 1) throw new Error("Görev revizyonu değişti.");
    this.event(task.id, `task.${target}`);
    return next;
  }
  private current(id: string, revision: number): Task {
    const task = this.getTask(id);
    if (task.revision !== revision) throw new Error("Görev revizyonu değişti.");
    return task;
  }
  transition(
    id: string,
    revision: number,
    target: "ready" | "cancelled" | "interrupted",
  ): Task {
    return this.transaction(() =>
      this.update(
        this.current(id, revision),
        target,
        target === "ready"
          ? { runId: null, result: null, resultHash: null }
          : {},
      ),
    );
  }
  startRun(id: string, revision: number): Task {
    return this.transaction(() => {
      if (this.db.prepare("SELECT id FROM tasks WHERE status='running'").get())
        throw new Error("Bir demo görevi zaten çalışıyor.");
      return this.update(this.current(id, revision), "running", {
        runId: randomUUID(),
        result: null,
        resultHash: null,
      });
    });
  }
  completeRun(id: string, runId: string, result: string): Task {
    return this.transaction(() => {
      const task = this.getTask(id);
      if (task.runId !== runId || task.status !== "running")
        throw new Error("Eski veya iptal edilmiş koşu.");
      const resultHash = createHash("sha256").update(result).digest("hex");
      return this.update(task, "awaiting_review", { result, resultHash });
    });
  }
  failRun(id: string, runId: string): void {
    this.transaction(() => {
      const t = this.getTask(id);
      if (t.runId === runId && t.status === "running") this.update(t, "failed");
    });
  }
  accept(id: string, revision: number, resultHash: string): Task {
    return this.transaction(() => {
      const task = this.current(id, revision);
      if (!task.resultHash || resultHash !== task.resultHash)
        throw new Error("Teslim özeti değişti.");
      return this.update(task, "succeeded");
    });
  }
  recover(): void {
    this.transaction(() => {
      for (const row of this.db
        .prepare("SELECT * FROM tasks WHERE status='running'")
        .all())
        this.update(taskSchema.parse(row), "interrupted");
    });
  }
  snapshot(): Snapshot {
    return {
      mode: "mock",
      projects: this.db
        .prepare("SELECT * FROM projects ORDER BY rowid")
        .all()
        .map((p) => projectSchema.parse(p)),
      tasks: this.db
        .prepare("SELECT * FROM tasks ORDER BY rowid")
        .all()
        .map((t) => taskSchema.parse(t)),
      events: this.db
        .prepare("SELECT * FROM events ORDER BY sequence DESC LIMIT 100")
        .all()
        .map((e) => eventSchema.parse(e)),
    };
  }
}
