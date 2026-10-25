// Runs the real production entry, preload, renderer, Node worker and SQLite.
// Never disable Electron's sandbox in this test.
const { app } = require("electron");
const { writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const data = process.env.AJANKATI_SMOKE_DATA;
if (!data)
  throw new Error("Use pnpm test:desktop to create an isolated test profile");
process.on("uncaughtException", (error) => {
  console.error(error);
  app.exit(1);
});
let passed = false;
const timer = setTimeout(() => {
  console.error("Desktop smoke timed out");
  app.exit(1);
}, 20000);
app.on("will-quit", () => {
  clearTimeout(timer);
  if (!passed) app.exit(1);
});
app.on("browser-window-created", (_event, window) => {
  window.webContents.on("did-finish-load", async () => {
    try {
      const prefs = window.webContents.getLastWebPreferences();
      if (!prefs.sandbox || !prefs.contextIsolation || prefs.nodeIntegration)
        throw new Error("Unsafe renderer preferences");
      await window.webContents.executeJavaScript(`(async () => {
        if (!document.body.textContent.includes('Demo — gerçek ajan çalışmıyor')) throw new Error('Missing demo label');
        if (typeof window.require !== 'undefined') throw new Error('Renderer has Node access');
        let state = await window.ajankati.createProject('Electron testi');
        state = await window.ajankati.createTask(state.projects[0].id, 'Gerçek köprü, sahte ajan');
        let task = state.tasks[0];
        state = await window.ajankati.ready(task.id, task.revision);
        task = state.tasks[0];
        await window.ajankati.run(task.id, task.revision);
        for (let i=0;i<50;i++) {
          state = await window.ajankati.snapshot();
          if (state.tasks[0].status === 'awaiting_review') break;
          await new Promise(resolve=>setTimeout(resolve,30));
        }
        task = state.tasks[0];
        if (task.status !== 'awaiting_review') throw new Error('Mock did not reach review');
        state = await window.ajankati.accept(task.id,task.revision,task.resultHash);
        if (state.tasks[0].status !== 'succeeded') throw new Error('Acceptance failed');
      })()`);
      if (process.env.AJANKATI_SMOKE_SCREENSHOT)
        writeFileSync(
          process.env.AJANKATI_SMOKE_SCREENSHOT,
          (await window.webContents.capturePage()).toPNG(),
        );
      passed = true;
      console.log(
        "PASS Electron renderer → preload → main → Node worker → SQLite → mock → human-accept command",
      );
    } catch (error) {
      console.error(error);
    } finally {
      app.quit();
    }
  });
});
require(resolve("apps/desktop/dist/main.cjs"));
// Production entry sets the normal path synchronously; override only inside this isolated harness before ready.
app.setPath("userData", data);
