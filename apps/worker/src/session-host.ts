import { sessionCommandSchema, type SessionState } from "@ajankati/contracts";
import type { Store } from "@ajankati/storage";

/** Production gate: deliberately no launcher, environment flag or fixture hook. */
export class SessionHost {
  constructor(private store: Store) {}
  execute(input: unknown): SessionState {
    const command = sessionCommandSchema.parse(input);
    if (command.method !== "list")
      throw new Error(
        "Canlı Codex pilotu kapalı; süreç sahipliği, izin ve sağlayıcı uyumluluğu kanıtlanmadı.",
      );
    return {
      capability: {
        provider: "codex",
        liveLaunch: false,
        protocol: "app-server/stdio",
        blockers: [
          "Codex için yarışsız native stdio başlatma ve süreç ağacı sahipliği doğrulanmadı.",
          "Proje kökü, oturum ayarları ve Windows dosya/ağ sınırları doğrulanmadı.",
          "Kurulu CLI ile canlı protokol, izin ve model erişimi doğrulanmadı.",
          "İlk çıkarım ayrıca insan onayı gerektirir; Claude entegrasyonu kapalıdır.",
        ],
      },
      sessions: this.store
        .sessions()
        .filter((row) => row.source === "codex-app-server"),
    };
  }
}
