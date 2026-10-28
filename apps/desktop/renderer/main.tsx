import { createRoot } from "react-dom/client";
import { Dashboard } from "./Dashboard";
import "./style.css";
import { TerminalPanel } from "./TerminalPanel";
import { AgentsPanel } from "./AgentsPanel";
import { SessionsPanel } from "./SessionsPanel";
createRoot(document.getElementById("root")!).render(
  <Dashboard
    api={window.ajankati}
    reports={<SessionsPanel api={window.ajankatiSessions} />}
    agents={<AgentsPanel api={window.ajankatiAgents} />}
    terminal={<TerminalPanel api={window.ajankatiTerminal} />}
  />,
);
