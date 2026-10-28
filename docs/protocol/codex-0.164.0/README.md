# Codex 0.164.0 protocol evidence

These five unmodified JSON schemas were generated locally on 2026-10-29 by the
pinned Windows x64 native executable (SHA-256
`6f267830b029ee25d9339864aa867cd45de9f8fd4c5ea007d2e63c13a0c66d36`).
Command: `codex.exe app-server generate-json-schema --out <fresh temporary directory>`.
Only schema generation ran, with a fresh temporary cwd/home and a minimal environment;
no provider server, probe plan, ledger, authentication or inference was started.
The command exited 0. Its 273 stderr bytes were counted, not printed or saved.

The [versioned CLI dispatch](https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/cli/src/main.rs)
selects protocol generation for this subcommand instead of server startup.
The [official protocol documentation](https://learn.chatgpt.com/docs/app-server)
specifies JSONL over stdio, responses with the request id, and notifications without
an id. A transport read is not a JSONL message boundary.

InitializeResponse requires userAgent, codexHome, platformFamily and platformOs.
The existing validator already strips extra result fields; their presence alone
cannot explain the incident. The handshake retains its minimal userAgent check
for existing fixtures. It discards all result metadata, including codexHome.
Only the three startup notification schemas here are permitted, without an id;
thread-specific warnings, unknown messages, duplicate responses and all server
requests fail closed. Text/path fields are validated transiently, never recorded.
Total stdout is capped at 256 KiB and 64 frames. This is intentionally a smaller
surface than the entire app-server protocol.
