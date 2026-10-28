import type { DesktopApi, TerminalApi, AgentApi } from "@ajankati/contracts";
declare global {
  interface Window {
    ajankati: DesktopApi;
    ajankatiTerminal: TerminalApi;
    ajankatiAgents: AgentApi;
  }
}
