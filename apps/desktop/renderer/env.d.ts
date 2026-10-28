import type {
  DesktopApi,
  TerminalApi,
  AgentApi,
  SessionApi,
} from "@ajankati/contracts";
declare global {
  interface Window {
    ajankati: DesktopApi;
    ajankatiTerminal: TerminalApi;
    ajankatiAgents: AgentApi;
    ajankatiSessions: SessionApi;
  }
}
