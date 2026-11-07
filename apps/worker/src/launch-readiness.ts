import type { IntegrationId } from "@ajankati/contracts";

/** Exact provider builds a future, separately authorized acceptance test may target.
 * Evidence is per exact version: nothing recorded for 0.164.0 or any other build
 * transfers to these. */
export const PINNED_VERSIONS: Record<IntegrationId, string> = {
  "claude-code": "2.1.296",
  "codex-cli": "0.167.0",
};
export const REQUIRED_EVIDENCE = [
  "EXECUTABLE_CONTENT_PIN",
  "FILESYSTEM_ISOLATION",
  "NETWORK_ISOLATION",
  "CREDENTIAL_SCOPE",
  "STARTUP_CONFIG_EFFECTS",
  "PERMISSION_PROMPT_CHANNEL",
  "INTERACTIVE_TTY",
  "CTRL_C_CANCELLATION",
  "DESCENDANT_CLEANUP",
] as const;
export type EvidenceId = (typeof REQUIRED_EVIDENCE)[number];
export type AcceptedEvidence = Partial<
  Record<IntegrationId, Record<string, readonly EvidenceId[]>>
>;
/** Intentionally empty: no provider/version has accepted launch evidence (M1.3A). */
export const ACCEPTED_EVIDENCE: AcceptedEvidence = {};
export const LIVE_LAUNCH_ENABLED = false as const;

export type LaunchReadiness = { go: boolean; blockers: string[] };

/** Deny-by-default. `go` can only become true with a pinned version, every evidence
 * item and a clean workspace, and the build-time LIVE_LAUNCH_ENABLED gate. Even then
 * the host still refuses with REAL_LAUNCH_DISABLED; this only explains why. */
export function evaluateLaunchReadiness(input: {
  integrationId: IntegrationId;
  verifiedVersion: string | null;
  startupConfig: readonly string[];
  evidence?: AcceptedEvidence;
  liveLaunchEnabled?: boolean;
}): LaunchReadiness {
  const blockers: string[] = [];
  if (!(input.liveLaunchEnabled ?? LIVE_LAUNCH_ENABLED))
    blockers.push("LIVE_LAUNCH_DISABLED");
  if (input.verifiedVersion === null) blockers.push("VERSION_UNVERIFIED");
  else if (input.verifiedVersion !== PINNED_VERSIONS[input.integrationId])
    blockers.push("VERSION_NOT_PINNED");
  const accepted = new Set(
    input.verifiedVersion === null
      ? []
      : ((input.evidence ?? ACCEPTED_EVIDENCE)[input.integrationId]?.[
          input.verifiedVersion
        ] ?? []),
  );
  for (const id of REQUIRED_EVIDENCE)
    if (!accepted.has(id)) blockers.push(`EVIDENCE_MISSING:${id}`);
  if (input.startupConfig.length > 0)
    blockers.push("WORKSPACE_STARTUP_CONFIG_PRESENT");
  return { go: blockers.length === 0, blockers };
}
