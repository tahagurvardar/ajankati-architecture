# M1.3A — Claude Security Preflight

Date: 7 Nov 2026. Branch: `feat/m1-3-claude-security-preflight`. Baseline: `c36e856`.

## Decision

**NO-LIVE-LAUNCH is unchanged.** `liveLaunch=false`, `managedExecution=false`,
`REAL_LAUNCH_DISABLED` is still thrown after every valid consent. No Claude or Codex
process (not even `--version`) was started by this work; no auth/token/credential/personal
config file was read or written. Electron sandbox, CSP and OS controls are untouched.
No new dependency, no paid infrastructure. The renderer, CSS and the `ajankatiHumanCli`
preload interface are unchanged (no contract change was needed).

**Overall: NO-GO for a real provider launch** (table in §5).

## 1. Audit result (what already held)

Reviewed `HumanCliBridge`, `HumanCliHost`, `WorkerClient`, `AgentRegistry.terminalIdentity`,
`withNativePath`, the worker entry and shutdown path, and main-process IPC wiring against the
M1.2 document. Already correct and **not duplicated**: strict Zod on every hop, channel-chosen
authority, token consumed before the first `await`, 60 s expiry with wall-clock rollback +
monotonic + active timer, single-flight `BUSY`, native volume-serial/file-ID workspace pin,
no reconnect/replay, fixed-size frames, fail-closed client on timeout/malformed reply.

## 2. Gaps found and fixed (offline, evidence-backed)

| # | Gap (evidence) | Fix | Test |
|---|---|---|---|
| G1 | Executable identity was metadata only (`dev:ino:size:mtime:ctime`). A same-size in-place rewrite with restored timestamps is not detected. | SHA-256 of the image (and of the `.cmd` source shim when different) pinned at `prepare` and re-checked at `start`; streamed, 512 MiB cap, aborted on owner stop. Digest failure ⇒ no session. `executable-digest.ts`, `human-cli-host.ts` | `human-cli-security` (in-place rewrite, digest-only change, digest failure, abort on stop) |
| G2 | Any native-picked directory was accepted, including the user profile or a parent of it, which places every provider credential/config directory under the CLI's cwd. | `WORKSPACE_TOO_BROAD` for workspaces equal to or containing the profile, `AppData`, `%SystemRoot%`, Program Files, ProgramData (derived from the account profile, since the worker env is minimal). `workspace-policy.ts` | pure matrix in `security-hardening`; real native `homedir()`/parent in `human-cli-security` |
| G3 | Workspace-controlled startup config (Claude/Codex project settings, MCP config, instruction files) could appear after consent and was not part of the sealed identity. | Existence-only `lstat` of 7 provider entry names (never read) is sealed into the identity; a change ⇒ `IDENTITY_CHANGED`. Presence is also a readiness blocker. | `human-cli-security` (appears after prepare) |
| G4 | Worker `stop()` was a straight-line `await` chain: a throw in `terminal.stop()`/`service.stop()` (e.g. `rmSync` failure) skipped store close and **lock release**, leaving a stale lock that blocks every later start, and `void stop()` became an unhandled rejection. | `runShutdown`: every step isolated with a per-step deadline; failures recorded by step name only; lock always released; exit code 1 if any step failed. Process exit still closes the Job (descendants). `shutdown.ts`, `index.ts` | `security-hardening` (throw/hang/reject, no message leak); real-worker lock release on disconnect |
| G5 | `WorkerClient.close()` awaited `exit` after `kill()` with no bound; a child that never reports exit would hold application quit forever. | Configurable bound after kill (defaults 8 s grace + 3 s) then settle; failure of all later requests is kept. | `worker-client-shutdown` (real stubborn peer), `worker-client-unkillable` (no exit event) |
| G6 | Main-process sender check was inline and untested (null/destroyed `senderFrame` was only rejected by a thrown `TypeError`). | Extracted to `ipc-guard.ts` `isTrustedSender` (explicit null, sub-frame, wrong URL, other window, quitting, no window). | `security-hardening` |
| G7 | No code-level compatibility/isolation gate; every refusal looked identical. | `launch-readiness.ts`: deny-by-default evidence matrix per **exact** version (`claude-code 2.1.296`, `codex-cli 0.167.0`), empty accepted-evidence registry, `LIVE_LAUNCH_ENABLED=false`. `start` still throws `REAL_LAUNCH_DISABLED`, now with a blocker **count**. Worker returns only an allow-listed reason code (`[CODE]`) to the renderer, never free text. | `security-hardening` (no `go` without all evidence; 0.164.0 evidence does not transfer), `human-cli-security` |

Considered and **rejected as duplicate**: a bridge-side "already expired" check (the worker's
`list` already expires the session and nulls the token before the bridge reads it);
constant-time token compare (UUID over an inherited IPC channel; no remote attacker).

## 3. Threat model

Attacker classes: **A** compromised renderer; **B** hostile workspace content; **C** hostile or
buggy provider process (future); **D** other same-user local process; **E** the operator's own
mistake. Same-user code (D) that can start the worker or edit the executable between the
pin and launch is **outside** what this layer can stop (see residual).

| Area | Threat | Current control | Residual / needed before launch |
|---|---|---|---|
| Filesystem | C reads/writes outside the workspace | Workspace is a *cwd*, not a boundary; G2 keeps the profile out of scope; restricted token / Job Object are **not** filesystem isolation | **Unproven.** LPAC preflight is NO-GO. Needs a measured AppContainer/LPAC (or VM) boundary with negative tests |
| Credentials / config | C or B exposes `~/.claude`, `~/.codex`, API keys; provider needs its own config to authenticate | Worker env is allow-listed; `--version` probe env has no profile vars; forbidden path names; no auth file is read | Env policy for a real launch is undecided: giving the provider its credential store *is* credential exposure. Needs a dedicated per-provider config dir/secret handling decision |
| Plugins / hooks / MCP | B plants project hooks, MCP servers, instruction files that run or steer the agent at startup (provider-documented behaviour, **not observed here**) | G3 seals presence of 7 entry names; any presence blocks readiness | Contents are never inspected; need per-version proof of which files execute code and a deny/override mechanism, or launch only in an empty disposable workspace |
| Environment inheritance | Secrets in the parent env reach the provider and its tools | Worker env is `PATH, SystemRoot, WINDIR, TEMP, TMP, LANG`; the existing ConPTY terminal path is separate and not a provider launcher | No launch environment builder exists yet (deliberately); must be allow-list based and tested with canary variables |
| Process descendants | Provider spawns grandchildren that outlive cancel/quit | Existing Job Object + worker-death + nested-tree harmless-fixture tests; G4 never skips Job-closing steps | Proven for diagnostic fixtures only, not for either provider's real process tree (node helpers, MCP servers, shells) |
| Network | C exfiltrates workspace/credentials or reaches arbitrary hosts; the provider *must* reach its API | None. App CSP covers the renderer only | **Unproven.** Needs egress control evidence (not a Job Object property) |
| Executable replacement | Swap the image between consent and launch | Metadata pin + G1 content pin, re-verified after every `await` | Not atomic with `CreateProcess`; needs a pinned signer/hash allow-list and launch from a locked copy or handle |
| Renderer inputs | A forges paths, argv, tokens, owners | Strict preload API, channel-chosen authority, G6 | None known offline |
| Approval replay / expiry | Reuse, race or late-click a consent | Token consumed pre-`await`, single use, clock rollback, no replay | None known offline |
| Crash / shutdown | Worker/app dies mid-consent or with a child | No reconnect; all authority is in-memory; G4/G5 | Real children untested (no launch) |

## 4. Compatibility assessment (assumes nothing; nothing was executed)

Evidence for one exact version never carries to another. Local versions were *reported by the
user* (not re-probed here): Claude Code **2.1.296**, Codex CLI **0.167.0**.

| Requirement | Claude Code 2.1.296 | Codex CLI 0.167.0 |
|---|---|---|
| Image identity | No recorded content hash/signer. Needs SHA-256 + Authenticode result of the exact installed image | Same; if installed via npm shim, hash both the shim and the vendor `codex.exe` |
| Safe interactive argv | Unknown; need the minimal argv that starts the interactive UI without opening extra surfaces | Unknown; 0.164.0 initialize/notification/tool research does **not** apply |
| Startup config effects | Unobserved: which user/project files are read, which can run code (hooks, MCP, commands), what telemetry/update/network calls occur at start | Unobserved for 0.167.0: config/extension/client-API effects, MCP, update checks |
| Permission requests | Need to see how a human is asked, on which channel, and that denial is the default under a closed stdin | Same; human permission channel must be shown, not inferred |
| stdin/stdout | Need ConPTY raw-mode behaviour, Unicode/Turkish cwd, paste, bracketed paste, large output | Same |
| Resize | Need observed redraw and no crash on rapid resize | Same |
| Ctrl+C | Need first-press (cancel turn) vs double-press (exit) semantics and exit codes | Same |
| Cancellation | Need bounded stop: provider-level interrupt → ConPTY close → Job close | Same |
| Descendant cleanup | Need a process-tree snapshot before/during/after, including MCP/helper children | Same |
| Credential/config scope | Need the exact files/env the provider needs to authenticate and a way to scope them | Same |
| Network profile | Need the host list at idle, start and a turn, under a network monitor | Same |

These are encoded as `REQUIRED_EVIDENCE` (9 items) in `launch-readiness.ts`; the registry of accepted
evidence is intentionally empty.

## 5. Blockers and decisions

| Blocker | Decision |
|---|---|
| Filesystem isolation unproven (LPAC NO-GO) | **NO-GO** |
| Network isolation unproven | **NO-GO** |
| Provider credential/config scoping undecided | **NO-GO** |
| Startup-config (hooks/MCP/plugins) effects unobserved per version | **NO-GO** |
| Interactive/permission/Ctrl+C/resize/descendant behaviour unobserved per version | **NO-GO** |
| Executable atomic-at-launch identity | **NO-GO** (best effort now: metadata + content pin) |
| Consent/approval lifecycle, renderer validation, workspace pin, worker shutdown (offline) | **GO** for the offline preparation scope only |

## 6. Evidence required before the first explicitly approved real CLI test

1. Separate written authorization naming one provider, one exact version, one disposable
   workspace, a time limit, and spend/model-request limits.
2. Image SHA-256 + signer recorded for that version and wired into an allow-list (§4 row 1).
3. A filesystem boundary demonstrated by negative tests (profile, sibling dirs, other drives, UNC)
   and an egress boundary demonstrated by a network capture; restricted token/Job Object alone do not count.
4. A launch environment builder (allow-list) tested with canary variables, and a decided,
   documented credential-scope approach.
5. Startup-config observation for that version in an empty workspace *and* with hostile project
   config, with the executing surfaces named.
6. Recorded interactive behaviour (stdin/stdout, resize, Ctrl+C, permission prompt default-deny, cancel).
7. Process-tree evidence at idle/turn/cancel/app-quit showing zero survivors, plus worker-kill cleanup.
8. `REQUIRED_EVIDENCE` entries for that exact version added to `ACCEPTED_EVIDENCE`, and a separate
   reviewed change that flips the build-time gate. This milestone does neither.

## 7. Verification (Windows x64, Node 24.20.0, pnpm 11.25.0)

| Command | Result |
|---|---|
| `pnpm lint`, `pnpm typecheck` | clean |
| `pnpm verify` (lint, typecheck, native + renderer build, tests) | exit 0; **43 files, 498 passed / 1 skipped** (baseline M1.2: 38 files / 455 passed / 1 skipped); 61.9 s tests |
| `AJANKATI_SMOKE_APPROVE_AGENT_VERSIONS=0 pnpm test:desktop` | exit 0; 0 FAIL lines. Expected negative-schema ZodError logs remain; no provider process, no `--version` |
| `pnpm audit --prod` | No known vulnerabilities found |
| `git diff --check` | exit 0 (CRLF warnings are the repo's existing autocrlf behaviour) |

New test files: `security-hardening` (18), `human-cli-security` (8), `worker-client-shutdown` (1),
`worker-client-unkillable` (1). The one existing skip is the unprivileged-symlink native case from M1.2.
Existing `human-cli-bridge.test.ts` only gained injected digest/scan options for its non-existent fixture image.

Not tested: a physical picker click, Ubuntu CI (native cases are `runIf(win32)`; the new pure tests are
platform-independent), real provider behaviour of any kind.

## 8. UI coordination

No API change. The renderer will now see, in the rejection message of a failed human-CLI call,
a trailing `[CODE]` from this closed set: `OWNER_STOPPED, BUSY, WORKSPACE_LIMIT, WORKSPACE_UNKNOWN,
WORKSPACE_TOO_BROAD, IDENTITY_CHANGED, IDENTITY_UNAVAILABLE, PREPARATION_TIMEOUT, SESSION_OWNER,
CONSENT_INVALID, CONSENT_EXPIRED, REAL_LAUNCH_DISABLED`. It is optional to display. `prepare` can now take
slightly longer (image hashing). The 10 s preparation limit is checked after hashing completes; a hung read is bounded by the client's 10 s reply timeout, which closes the human-CLI channel (fail closed).
