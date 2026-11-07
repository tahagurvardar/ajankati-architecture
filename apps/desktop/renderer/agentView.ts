import type { AgentRecord, IntegrationId } from "@ajankati/contracts";

export const capabilityLabels: Record<
  keyof AgentRecord["capabilities"],
  string
> = {
  versionCheck: "Sürüm kontrolü",
  pty: "Gerçek ajan terminali",
  processOwnership: "Süreç ağacı sahipliği",
  permissions: "İzin denetimi",
  cancellation: "İptal",
  sandbox: "Sandbox",
  structuredEvents: "Yapılandırılmış olaylar",
  managedTasks: "Yönetilen görevler",
};
export const capabilityStatus = {
  verified: "Doğrulandı",
  unknown: "Bilinmiyor",
  unsupported: "Bu aşamada desteklenmiyor",
};

export type CapabilityState = "verified" | "unknown" | "unsupported";
/** Unknown keys or values are shown as unknown, never blank or as verified. */
export function capabilityLabel(key: string): string {
  return (
    (capabilityLabels as Record<string, string | undefined>)[key] ??
    `Bilinmeyen yetenek (${key})`
  );
}
export function capabilityInfo(value: unknown): {
  state: CapabilityState;
  symbol: string;
  text: string;
} {
  if (value === "verified")
    return { state: "verified", symbol: "✓", text: "Doğrulandı" };
  if (value === "unsupported")
    return {
      state: "unsupported",
      symbol: "—",
      text: capabilityStatus.unsupported,
    };
  return {
    state: "unknown",
    symbol: "?",
    text: "Bilinmiyor · henüz doğrulanmadı",
  };
}

export type OfficeRoleKey = "claude" | "codex" | "tester" | "research";
export type OfficeRole = {
  key: OfficeRoleKey;
  name: string;
  glyph: string;
  /** Real CLI inventory row this character maps to; null = design role only. */
  integrationId: IntegrationId | null;
};
// Order follows the approved HTML prototype's hotspots.
export const officeRoles: readonly OfficeRole[] = [
  {
    key: "claude",
    name: "Claude Code",
    glyph: "⌘",
    integrationId: "claude-code",
  },
  { key: "codex", name: "Codex CLI", glyph: "⌘", integrationId: "codex-cli" },
  { key: "research", name: "Araştırma Rolü", glyph: "⌕", integrationId: null },
  { key: "tester", name: "Test / QA Rolü", glyph: "✓", integrationId: null },
];

export type AgentTone = "ok" | "neutral" | "warn";
export type InventoryState = "loading" | "ready" | "failed";
/** Honest one-line status. "verified" never means connected, enabled or running. */
export function describeInventory(
  role: OfficeRole,
  record: AgentRecord | undefined,
  inventory: InventoryState,
): { label: string; tone: AgentTone } {
  if (!role.integrationId)
    return { label: "Tasarım rolü · bağlı ajan yok", tone: "neutral" };
  if (inventory === "loading")
    return { label: "Ajan kaydı okunuyor…", tone: "neutral" };
  if (inventory === "failed" || !record)
    return { label: "Ajan kaydı alınamadı", tone: "warn" };
  if (record.verified)
    return { label: "Yalnız sürüm doğrulandı · etkin değil", tone: "ok" };
  if (record.discovered)
    return { label: "Bulundu · doğrulanmadı · etkin değil", tone: "neutral" };
  if (record.error) return { label: "Bulunamadı", tone: "warn" };
  return { label: "Henüz keşfedilmedi", tone: "neutral" };
}
