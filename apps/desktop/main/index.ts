import { app, BrowserWindow, ipcMain, session } from "electron";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";
import { parseRequest, terminalCommandSchema } from "@ajankati/contracts";
import { WorkerClient } from "./worker-client";

let window: BrowserWindow | undefined;
let worker: WorkerClient | undefined;
let quitting = false;
app.setName("AjanKati");
app.setPath("userData", join(app.getPath("appData"), "AjanKati-Phase1A"));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    window?.show();
    window?.focus();
  });
  void app
    .whenReady()
    .then(async () => {
      worker = new WorkerClient(
        resolve(__dirname, "../../worker/dist/index.cjs"),
        join(app.getPath("userData"), "foundation.sqlite"),
        true,
      );
      await worker.ready;
      const page = join(__dirname, "renderer/index.html");
      const trustedUrl = pathToFileURL(page).href;
      const styleNonce = randomBytes(24).toString("base64");
      session.defaultSession.webRequest.onHeadersReceived(
        (details, callback) => {
          callback({
            responseHeaders: {
              ...details.responseHeaders,
              "Content-Security-Policy": [
                `default-src 'self'; script-src 'self'; style-src 'self' 'nonce-${styleNonce}'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`,
              ],
            },
          });
        },
      );
      window = new BrowserWindow({
        width: 1200,
        height: 820,
        minWidth: 820,
        minHeight: 620,
        backgroundColor: "#f5f3ef",
        title: "AjanKatı — Demo",
        webPreferences: {
          preload: join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          additionalArguments: [`--ajankati-style-nonce=${styleNonce}`],
        },
      });
      session.defaultSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      for (const [channel, method] of Object.entries({
        "ajankati:terminal-start": "start",
        "ajankati:terminal-input": "input",
        "ajankati:terminal-read": "read",
        "ajankati:terminal-resize": "resize",
        "ajankati:terminal-interrupt": "interrupt",
        "ajankati:terminal-close": "close",
        "ajankati:snapshot": "snapshot",
        "ajankati:create-project": "project.create",
        "ajankati:create-task": "task.create",
        "ajankati:ready": "task.ready",
        "ajankati:run": "task.run",
        "ajankati:cancel": "task.cancel",
        "ajankati:accept": "task.accept",
      })) {
        ipcMain.handle(channel, async (event, payload: unknown) => {
          if (
            !window ||
            event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame ||
            event.senderFrame.url !== trustedUrl
          )
            throw new Error("Yetkisiz pencere.");
          // Runtime schemas are validated again by client and worker; channel chooses authority.
          if (channel.startsWith("ajankati:terminal-"))
            return worker!.terminal(
              terminalCommandSchema.parse({ method, payload }),
            );
          return worker!.request(
            parseRequest({ version: 1, requestId: "desktop", method, payload }),
          );
        });
      }
      window.webContents.on("render-process-gone", () => app.quit());
      // Reload creates a new renderer epoch: tear down the old owner, never reattach silently.
      window.webContents.on("will-navigate", () => app.quit());
      window.webContents.once("did-finish-load", () => {
        window?.webContents.on(
          "did-start-navigation",
          (_event, _url, _inPlace, isMainFrame) => {
            if (isMainFrame) app.quit();
          },
        );
      });
      await window.loadFile(page);
      window.on("closed", () => {
        window = undefined;
        app.quit();
      });
    })
    .catch(() => {
      console.error(
        "AjanKatı başlatılamadı. İşçi, kilit ve çalışma zamanı gereksinimlerini kontrol edin.",
      );
      app.quit();
    });
  app.on("before-quit", (event) => {
    if (quitting || !worker) return;
    event.preventDefault();
    quitting = true;
    void worker.close().finally(() => app.quit());
  });
  app.on("window-all-closed", () => app.quit());
}
