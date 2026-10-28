// Explicit manual Windows verification only. Not part of CI or automatic startup.
// Runs exactly the approved --version probes against locally discovered identities.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WorkerClient } from "../apps/desktop/main/worker-client";
if (
  process.platform !== "win32" ||
  process.argv[2] !== "--approve-version-checks"
)
  throw new Error(
    "Windows üzerinde açık --approve-version-checks onayı gerekir.",
  );
const dir = mkdtempSync(join(tmpdir(), "ajankati-cli-verification-"));
const client = new WorkerClient(
  resolve("apps/worker/dist/index.cjs"),
  join(dir, "verification.sqlite"),
);
try {
  let state = await client.agents({ method: "discover", payload: {} });
  for (const row of state.integrations) {
    if (row.approvalToken)
      state = await client.agents({
        method: "verify",
        payload: {
          integrationId: row.integrationId,
          approvalToken: row.approvalToken,
          approved: true,
        },
      });
  }
  console.log(JSON.stringify(state, null, 2));
} finally {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
}
