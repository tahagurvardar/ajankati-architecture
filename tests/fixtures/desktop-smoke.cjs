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
let unexpectedCspError = false;
let probingCsp = false;
const timer = setTimeout(() => {
  console.error("Desktop smoke timed out");
  app.exit(1);
}, 35000);
app.on("will-quit", () => {
  clearTimeout(timer);
  if (!passed) app.exit(1);
});
app.on("browser-window-created", (_event, window) => {
  window.webContents.on("console-message", (event) => {
    if (event.message.includes("Content Security Policy")) {
      if (!probingCsp) unexpectedCspError = true;
      return;
    }
    if (event.level === "error") console.error("RENDERER", event.message);
  });
  window.webContents.on("did-finish-load", async () => {
    try {
      console.log("SMOKE renderer loaded");
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
      console.log("SMOKE mock acceptance completed");
      if (unexpectedCspError) throw new Error("Terminal styles violated CSP");
      probingCsp = true;
      await window.webContents.executeJavaScript(`(async () => {
        const probe = document.createElement('div'); probe.id='csp-probe'; document.body.appendChild(probe);
        const style = document.createElement('style'); style.textContent='#csp-probe { color: rgb(1, 2, 3) !important; }'; document.head.appendChild(style);
        const script = document.createElement('script'); script.textContent='window.__unsafeCspProbe = true'; document.head.appendChild(script);
        await new Promise(resolve=>setTimeout(resolve,30));
        const failed = window.__unsafeCspProbe || getComputedStyle(probe).color === 'rgb(1, 2, 3)';
        probe.remove(); style.remove(); script.remove();
        if (failed) throw new Error('CSP allowed untrusted inline content');
      })()`);
      probingCsp = false;
      console.log("PASS CSP rejects untrusted inline script and style");
      if (process.platform === "win32") {
        window.show();
        window.focus();
        await window.webContents.executeJavaScript(`(async () => {
          document.querySelector('.terminal-panel').scrollIntoView();
          document.querySelector('.terminal-panel button').click();
          for (let i=0;i<100;i++) {
            if (document.querySelector('.xterm-rows')?.textContent.includes('READY')) return;
            await new Promise(resolve=>setTimeout(resolve,50));
          }
          throw new Error('ConPTY output did not reach xterm: ' + document.querySelector('.terminal-panel [role=status]').textContent + ' ' + document.querySelector('.xterm-rows')?.textContent);
        })()`);
        console.log("SMOKE terminal READY rendered");
        for (const char of "İıŞşĞğÜüÖöÇç") {
          window.webContents.sendInputEvent({ type: "char", keyCode: char });
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        window.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
        await window.webContents.executeJavaScript(`(async () => {
          for (let i=0;i<100;i++) {
            if (document.querySelector('.xterm-rows')?.textContent.includes('ECHO:İıŞşĞğÜüÖöÇç')) break;
            await new Promise(resolve=>setTimeout(resolve,50));
          }
          if (!document.querySelector('.xterm-rows')?.textContent.includes('ECHO:İıŞşĞğÜüÖöÇç')) throw new Error('Unicode keyboard roundtrip failed: ' + document.querySelector('.xterm-rows')?.textContent + ' ' + document.querySelector('.terminal-panel [role=alert]')?.textContent);
          document.querySelectorAll('.terminal-panel button')[1].click();
          for (let i=0;i<100;i++) {
            if (document.querySelector('.terminal-panel [role=status]').textContent.includes('Sonlandı')) return;
            await new Promise(resolve=>setTimeout(resolve,50));
          }
          throw new Error('Ctrl+C exit did not reach terminal UI');
        })()`);
        console.log(
          "PASS Windows ConPTY → xterm Unicode keyboard roundtrip → Ctrl+C → exit",
        );
      }
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
