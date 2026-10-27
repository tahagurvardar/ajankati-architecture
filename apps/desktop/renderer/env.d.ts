import type { DesktopApi, TerminalApi } from "@ajankati/contracts";
declare global {
  interface Window {
    ajankati: DesktopApi;
    ajankatiTerminal: TerminalApi;
  }
}
