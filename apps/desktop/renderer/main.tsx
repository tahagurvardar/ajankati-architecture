import { createRoot } from "react-dom/client";
import { Dashboard } from "./Dashboard";
import "./style.css";
import { TerminalPanel } from "./TerminalPanel";
createRoot(document.getElementById("root")!).render(
  <Dashboard
    api={window.ajankati}
    terminal={<TerminalPanel api={window.ajankatiTerminal} />}
  />,
);
