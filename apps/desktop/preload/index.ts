import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi, TerminalApi, AgentApi } from "@ajankati/contracts";
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
const terminal: TerminalApi = {
  styleNonce:
    process.argv
      .find((arg) => arg.startsWith("--ajankati-style-nonce="))
      ?.split("=")
      .slice(1)
      .join("=") ?? "",
  start: (cols, rows) =>
    ipcRenderer.invoke("ajankati:terminal-start", {
      profile: "safe-echo",
      cols,
      rows,
    }),
  input: (sessionId, data) =>
    ipcRenderer.invoke("ajankati:terminal-input", { sessionId, data }),
  read: (sessionId, cursor) =>
    ipcRenderer.invoke("ajankati:terminal-read", { sessionId, cursor }),
  resize: (sessionId, cols, rows) =>
    ipcRenderer.invoke("ajankati:terminal-resize", { sessionId, cols, rows }),
  interrupt: (sessionId) =>
    ipcRenderer.invoke("ajankati:terminal-interrupt", { sessionId }),
  close: (sessionId) =>
    ipcRenderer.invoke("ajankati:terminal-close", { sessionId }),
};
contextBridge.exposeInMainWorld("ajankatiTerminal", Object.freeze(terminal));
const agents: AgentApi = {
  list: () => ipcRenderer.invoke("ajankati:agents-list", {}),
  discover: () => ipcRenderer.invoke("ajankati:agents-discover", {}),
  verify: (integrationId, approvalToken) =>
    ipcRenderer.invoke("ajankati:agents-verify", {
      integrationId,
      approvalToken,
      approved: true,
    }),
};
contextBridge.exposeInMainWorld("ajankatiAgents", Object.freeze(agents));
