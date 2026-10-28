import type { TaskStatus } from "@ajankati/contracts";
export const taskLabels: Record<TaskStatus, string> = {
  draft: "Taslak",
  ready: "Hazır",
  running: "Çalışıyor",
  awaiting_review: "İnceleme bekliyor",
  succeeded: "Kabul edildi",
  failed: "Başarısız",
  cancelled: "İptal edildi",
  interrupted: "Kesildi",
};
