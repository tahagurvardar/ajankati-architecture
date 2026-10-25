import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "@ajankati/contracts";
const api: DesktopApi = {
  snapshot: () => ipcRenderer.invoke("ajankati:snapshot", {}),
  createProject: (name) =>
    ipcRenderer.invoke("ajankati:create-project", { name }),
  createTask: (projectId, title) =>
    ipcRenderer.invoke("ajankati:create-task", { projectId, title }),
  ready: (taskId, revision) =>
    ipcRenderer.invoke("ajankati:ready", { taskId, revision }),
  run: (taskId, revision) =>
    ipcRenderer.invoke("ajankati:run", { taskId, revision }),
  cancel: (taskId, revision) =>
    ipcRenderer.invoke("ajankati:cancel", { taskId, revision }),
  accept: (taskId, revision, resultHash) =>
    ipcRenderer.invoke("ajankati:accept", { taskId, revision, resultHash }),
};
contextBridge.exposeInMainWorld("ajankati", Object.freeze(api));
