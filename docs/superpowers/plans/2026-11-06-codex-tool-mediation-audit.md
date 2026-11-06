# Phase 1C-3F offline audit plan

**Goal:** Evaluate pinned Codex 0.164.0 complete mediation without enabling execution.
**Architecture:** Read-only exact-commit research plus an isolated in-memory JSONL policy model. No production imports, transport, executor, approval route or credential access.
**Spec:** User's Phase 1C-3F requirements; existing 3A–3E security decisions.
**Stack:** Existing TypeScript, Zod and Vitest; no new dependencies.

- [x] Inspect named repository evidence and resolve official release tag to a commit.
- [x] Trace requests, notifications, execution paths, cancellation and auth; record source hashes and capability matrix.
- [x] Write focused synthetic tests, observe failure, implement bounded offline model.
- [x] Produce Turkish NO-GO/CONDITIONAL/GO decision with explicit UNKNOWN boundaries.
- [x] Run frozen install, verify, desktop smoke with provider probes disabled, production audit; record failures/skips/reruns.
- [x] Review scoped diff and obtain independent read-only review.

Delivery follows validation: commit, push and open PR against main; never merge.
Git history and the PR record identify the delivered revision.

The user already authorized this research experiment and its offline simulation.
The model accepts only a synthetic read-resource dynamic tool, binds review to the
exact request and trusted fixture context, rejects ambiguity, and always returns
executionAllowed=false. It does not claim to emulate all Codex behavior. Existing
worker, SQLite, approvals, recovery, R1–R4 and liveExecution remain unchanged.
