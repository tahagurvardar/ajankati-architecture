// Runs the real production entry, preload, renderer, Node worker and SQLite.
// Never disable Electron's sandbox in this test.
const { app } = require("electron");
const { writeFileSync, mkdirSync } = require("node:fs");
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
}, 60000);
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
      window.show();
      window.focus();
      const navigate = async (route) => {
        await window.webContents.executeJavaScript(
          `(() => { document.querySelector('[data-route="${route}"]').click(); return true; })()`,
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
      };
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
      await navigate("reports");
      await window.webContents.executeJavaScript(`(async () => {
        const state = await window.ajankatiSessions.list();
        if (state.capability.liveLaunch !== false || state.sessions.length !== 0) throw new Error('Unsafe pilot state');
        let rejected = false;
        try { await window.ajankatiSessions.start('p', true); } catch { rejected = true; }
        if (!rejected) throw new Error('Live pilot launch was not blocked');
        if (!document.body.textContent.includes('Maliyet ve Kullanım')) throw new Error('Missing usage UI');
      })()`);
      console.log("SMOKE sessions/v1 blocked; no inference");
      await navigate("overview");
      await window.webContents.executeJavaScript(`(async () => {
        document.querySelector('.page-heading button').click();
        const image = document.querySelector('.office-scene img');
        await image.decode();
        if (image.naturalWidth < 1000 || !image.src.startsWith('file:')) throw new Error('Scene missing or not local');
        if (!document.querySelector('figcaption').textContent.includes('CANLI OFİS DEĞİL')) throw new Error('Missing static preview notice');
        document.querySelectorAll('.view-controls button')[1].click();
        await new Promise(resolve => setTimeout(resolve,100));
        if (!document.querySelector('.panel-view').textContent.includes('Kabul edildi: 1')) throw new Error('Panel is not backed by snapshot');
        document.querySelectorAll('.view-controls button')[0].click();
      })()`);
      const screenshots = resolve("apps/desktop/dist/ui-sprint-1");
      mkdirSync(screenshots, { recursive: true });
      await navigate("projects");
      for (const [width, height, zoom] of [
        [1366, 768, 1],
        [1440, 900, 1],
        [1920, 1080, 1],
        [1366, 768, 1.25],
        [820, 620, 1.25],
      ]) {
        window.setContentSize(width, height);
        window.webContents.setZoomFactor(zoom);
        for (const route of [
          "overview",
          "projects",
          "agents",
          "approvals",
          "knowledge",
          "reports",
          "terminal",
          "integrations",
        ]) {
          await navigate(route);
          const layout = await window.webContents.executeJavaScript(`({
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            focused: document.activeElement === document.querySelector('h1'),
            current: document.querySelector('[aria-current="page"]').dataset.route,
          })`);
          if (layout.overflow || !layout.focused || layout.current !== route)
            throw new Error(
              "Layout/focus failure: " +
                JSON.stringify({ width, height, zoom, route, layout }),
            );
          if (
            zoom === 1 &&
            ["overview", "projects", "terminal"].includes(route)
          ) {
            await window.webContents.executeJavaScript("window.scrollTo(0,0)");
            writeFileSync(
              resolve(screenshots, `${route}-${width}x${height}.png`),
              (await window.webContents.capturePage()).toPNG(),
            );
          }
        }
        console.log(`SMOKE layout ${width}x${height} zoom ${zoom}`);
      }
      window.setContentSize(1366, 768);
      window.webContents.setZoomFactor(1);
      console.log(
        "PASS local scene, Office/Panel, all routes, focus and overflow at 3 desktop sizes + 125% zoom + narrow window",
      );
      await navigate("agents");
      await window.webContents.executeJavaScript(`(async () => {
        if (!document.querySelector('.agents-panel')?.textContent.includes('Ajanlar')) throw new Error('Missing agents view');
        const state = await window.ajankatiAgents.discover();
        if (state.integrations.length !== 2 || state.integrations.some(row => row.enabled || row.verified)) throw new Error('Discovery fabricated readiness');
        let rejected = false;
        try { await window.ajankatiAgents.verify('codex-cli', 'invalid-token'); } catch { rejected = true; }
        if (!rejected) throw new Error('Invalid approval accepted');
        document.querySelector('.agents-panel button').click();
        await new Promise(resolve => setTimeout(resolve,50));
        for (let i=0; i<100; i++) {
          if (document.querySelectorAll('.agent-card').length === 2 && !document.querySelector('.agents-panel button').disabled && !document.querySelector('.agents-panel').textContent.includes('Henüz keşfedilmedi')) return;
          await new Promise(resolve => setTimeout(resolve,30));
        }
        throw new Error('Discovery did not reach agents UI');
      })()`);
      console.log(
        "PASS agents discovery → preload → worker → Turkish UI; no automatic version process",
      );
      // Local manual opt-in only; CI never launches installed provider CLIs.
      if (process.env.AJANKATI_SMOKE_APPROVE_AGENT_VERSIONS === "1") {
        const versions = await window.webContents
          .executeJavaScript(`(async () => {
          for (const card of document.querySelectorAll('.agent-card')) {
            const button = card.querySelector('button');
            if (!button) throw new Error('Approved manual verification requires both installed CLIs');
            button.click();
            await new Promise(resolve=>setTimeout(resolve,50));
            for (let i=0;i<150;i++) {
              if (!document.querySelector('.agents-panel button').disabled) break;
              await new Promise(resolve=>setTimeout(resolve,50));
            }
            if (!card.textContent.includes('Yalnız sürüm doğrulandı')) throw new Error('Version verification failed: ' + card.textContent);
          }
          const state = await window.ajankatiAgents.list();
          if (state.integrations.some(row=>!row.verified || row.enabled)) throw new Error('Incorrect version-only status');
          return state.integrations.map(row=>({provider:row.provider,version:row.detectedVersion}));
        })()`);
        console.log(
          "PASS explicitly approved Windows UI version checks",
          versions,
        );
      }
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
        await navigate("terminal");
        await window.webContents.executeJavaScript(`(async () => {
          document.querySelector('.terminal-panel').scrollIntoView();
          document.querySelector('.terminal-panel button').click();
          for (let i=0;i<300;i++) {
            if (document.querySelector('.xterm-rows')?.textContent.includes('READY')) return;
            await new Promise(resolve=>setTimeout(resolve,50));
          }
          throw new Error('ConPTY output did not reach xterm: ' + document.querySelector('.terminal-panel [role=status]').textContent + ' ' + document.querySelector('.xterm-rows')?.textContent);
        })()`);
        console.log("SMOKE terminal READY rendered");
        await navigate("overview");
        await navigate("terminal");
        await window.webContents.executeJavaScript(`(() => {
          if (!document.querySelector('.xterm-rows').textContent.includes('READY')) throw new Error('Navigation lost terminal session');
          document.querySelector('.xterm-helper-textarea').focus();
        })()`);
        for (const line of ["Merhaba", ":size"]) {
          for (const char of line)
            window.webContents.sendInputEvent({ type: "char", keyCode: char });
          window.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
          await new Promise((resolve) => setTimeout(resolve, 150));
        }
        await window.webContents.executeJavaScript(`(async () => {
          for (let i=0; i<100; i++) {
            const output = document.querySelector('.xterm-rows').textContent;
            if (output.includes('ECHO:Merhaba') && /SIZE:\\d+x\\d+/.test(output)) return;
            await new Promise(resolve => setTimeout(resolve, 30));
          }
          throw new Error('Merhaba or :size did not roundtrip: ' + document.querySelector('.xterm-rows')?.textContent + ' / ' + document.querySelector('.terminal-panel [role=alert]')?.textContent);
        })()`);
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
        await window.webContents.executeJavaScript(`(async () => {
          document.querySelector('.terminal-panel button').click();
          for (let i=0;i<300;i++) {
            if (document.querySelector('.terminal-panel [role=status]').textContent.includes('Çalışıyor') && document.querySelector('.xterm-rows')?.textContent.includes('READY')) break;
            await new Promise(resolve=>setTimeout(resolve,50));
          }
          if (!document.querySelector('.terminal-panel [role=status]').textContent.includes('Çalışıyor') || !document.querySelector('.xterm-rows')?.textContent.includes('READY')) throw new Error('Second session did not start');
          document.querySelector('.xterm-helper-textarea').focus();
        })()`);
        for (const char of ":tree\r") {
          window.webContents.sendInputEvent({ type: "char", keyCode: char });
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        const treePids = await window.webContents
          .executeJavaScript(`(async () => {
          for (let i=0;i<100;i++) {
            const match = /TREE:(\\d+):(\\d+)/.exec(document.querySelector('.xterm-rows')?.textContent);
            if (match) return match.slice(1).map(Number);
            await new Promise(resolve=>setTimeout(resolve,50));
          }
          throw new Error('Nested diagnostic tree did not reach Electron');
        })()`);
        for (const pid of treePids) process.kill(pid, 0);
        await window.webContents.executeJavaScript(`(async () => {
          document.querySelectorAll('.terminal-panel button')[2].click();
          for (let i=0;i<100;i++) {
            if (document.querySelector('.terminal-panel [role=status]').textContent.includes('Sonlandı')) return;
            await new Promise(resolve=>setTimeout(resolve,50));
          }
          throw new Error('Close button did not terminate session');
        })()`);
        for (const pid of treePids) {
          let alive = true;
          try {
            process.kill(pid, 0);
          } catch {
            alive = false;
          }
          if (alive)
            throw new Error("Nested diagnostic survived Electron close");
        }
        console.log(
          "PASS session survives navigation; Merhaba, :size and second-session nested-tree cleanup " +
            treePids.join(","),
        );
      }
      if (process.env.AJANKATI_SMOKE_SCREENSHOT) await navigate("agents");
      if (process.env.AJANKATI_SMOKE_SCREENSHOT)
        await window.webContents.executeJavaScript(
          "new Promise(resolve => { document.querySelector('.agents-panel').scrollIntoView({behavior:'instant',block:'start'}); setTimeout(resolve,150); })",
        );
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
