import type { DesktopApi } from "@ajankati/contracts";
declare global {
  interface Window {
    ajankati: DesktopApi;
  }
}
