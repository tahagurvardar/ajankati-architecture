import { setTimeout } from "node:timers/promises";
export type Evidence = "verified" | "unsupported" | "unknown";
export interface AgentInput {
  taskId: string;
  runId: string;
  title: string;
}
export interface AgentResult {
  text: string;
  source: "mock" | "cli";
  usage: null | { inputTokens: number; outputTokens: number };
}
export interface AgentAdapter {
  readonly id: string;
  readonly kind: "mock-agent" | "cli-agent";
  readonly capabilities: {
    taskInput: Evidence;
    structuredLifecycle: Evidence;
    sandboxFilesystem: Evidence;
    sandboxNetwork: Evidence;
  };
  execute(input: AgentInput, signal: AbortSignal): Promise<AgentResult>;
}
/** Hosted models propose content; they never own a terminal or execute tools. */
export interface ModelAdapter {
  readonly id: string;
  readonly kind: "model-api";
  generate(
    request: { context: string; maxOutputTokens: number },
    signal: AbortSignal,
  ): Promise<{ text: string; usage: AgentResult["usage"] }>;
}
export class MockAgent implements AgentAdapter {
  readonly id = "mock-local-v1";
  readonly kind = "mock-agent" as const;
  readonly capabilities = {
    taskInput: "verified",
    structuredLifecycle: "verified",
    sandboxFilesystem: "unsupported",
    sandboxNetwork: "unsupported",
  } as const;
  async execute(input: AgentInput, signal: AbortSignal): Promise<AgentResult> {
    await setTimeout(150, undefined, { signal });
    return {
      text: `Demo — gerçek ajan çalışmıyor.\nGörev: ${input.title}\nSahte teslim hazır. Kod veya test çalıştırılmadı; insan incelemesi gerekiyor.`,
      source: "mock",
      usage: null,
    };
  }
}
