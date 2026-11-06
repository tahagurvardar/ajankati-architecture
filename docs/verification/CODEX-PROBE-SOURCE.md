# Explicit source for Codex probe preparation

The initialize-only probe remains pinned to Codex **0.164.0**, SHA256
`6f267830b029ee25d9339864aa867cd45de9f8fd4c5ea007d2e63c13a0c66d36`.

Without an option, `--prepare` still reads the executable from the current user's
global npm Codex installation. A different global version fails identity checking;
there is no fallback, download, installation change, or version-based bypass.

To select a preserved executable explicitly:

```powershell
node apps/worker/dist/codex-probe.cjs --prepare --source-executable "D:\path to preserved\codex.exe"
```

The option is accepted only in this exact preparation form. The source must be an
existing regular `.exe` file with an absolute, drive-qualified local Windows path.
Relative, drive-relative, root-relative, UNC/device paths, directories, symbolic
links, and shell wrappers are rejected. The extension is only a file-shape check:
the pinned SHA256 is mandatory before copying and is checked again at the
destination. An existing destination is never overwritten and must also match.
No checksum or version override exists. Invalid input never falls back to global
Codex. Filesystem access errors fail closed.

Preparation copies into the built script's own directory and creates its isolated
profile and unused plan. It does not start a process or create a lock or ledger.
`--approve-initialize-only` still accepts no additional arguments, including this
option. Its one-shot reservation, native identity gate, containment, cleanup and
quarantine behavior are unchanged. No inference is enabled.

## Fresh isolated R4 preparation

These are future operator instructions, not a record of a live probe. Use a new
checkout/worktree containing the source-fix commit, for example
`D:\dev\ajankati-codex-probe-2d-r4`. Do not reuse runtime, R1, R2 or R3 directories,
profiles, plans, locks, ledgers or generated files. Verify that the new checkout
and its ancestors contain no `.codex` configuration; do not remove existing policy
to bypass this check. Build within R4:

```powershell
Set-Location D:\dev\ajankati-codex-probe-2d-r4
pnpm install --frozen-lockfile
pnpm verify
```

After confirming that R4's `apps\worker\dist` has no previous `codex.exe`, probe
profile, plan, lock or ledger, prepare with the preserved source:

```powershell
node apps/worker/dist/codex-probe.cjs --prepare --source-executable "D:\dev\ajankati-codex-probe-2d-r2\apps\worker\dist\codex.exe"
```

This future command reads and hashes the R2 executable, copies it to R4, and hashes
the R4 copy. It does not write to R2 or use its evidence. Review the newly emitted
R4 plan, pinned version/hash, isolated profile and `inference: false`, then stop.
A live initialize-only handshake requires separate explicit human approval of
that concrete plan. Do not execute it as part of source-fix validation.

## Offline regression coverage

`tests/codex-probe.test.ts` executes the operator script in a VM with real temporary
file operations and streaming hashes. Only the digest of inert fixture bytes is
mapped to the pin in the test harness; production has no override. A closed import
allowlist denies ledger, handshake and native transport access. Tests cover the
explicit/default sources, invalid paths/files, source mismatch, corrupted copy,
stale destination, repeated preparation and strict argument rejection. They do
not read a real Codex binary or prior probe evidence, or launch an app-server.

## Source-fix validation (2026-11-06, Windows x64)

- `pnpm install --frozen-lockfile`: passed.
- `pnpm verify`: passed lint, typecheck, build and 241/241 tests (23 files).
- `pnpm test:desktop`: passed with `AJANKATI_SMOKE_APPROVE_AGENT_VERSIONS=0`.
- `pnpm audit --prod`: no known vulnerabilities.
- Focused Prettier check: passed.

The new tests were first observed failing against the original argument parser,
then passed after the fix. An initial test invocation also ran the full suite
before native fixtures were built and failed on missing build artifacts. The
first built verification run passed 240/241 tests but the existing dashboard
workflow test exceeded its five-second timeout while desktop smoke was running.
An unchanged, standalone `pnpm verify` rerun passed all 241 tests. The build retains
its existing large-renderer-chunk warning.

No live handshake or real Codex process was started. Global Codex and its settings,
runtime, R1, R2 and R3 were not changed; no R2 evidence was read during this fix.
