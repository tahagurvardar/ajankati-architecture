import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export const MAX_DIGEST_BYTES = 512 * 1024 * 1024;

/** Streaming SHA-256 of an executable image. Reads the file only; never runs it.
 * Metadata fingerprints can be preserved by an attacker who rewrites a file in place;
 * a content digest cannot. It is still not an atomic launch-time guarantee. */
export async function sha256File(
  path: string,
  signal?: AbortSignal,
  maxBytes = MAX_DIGEST_BYTES,
): Promise<string> {
  const hash = createHash("sha256");
  let bytes = 0;
  const stream = createReadStream(path, { highWaterMark: 1024 * 1024 });
  try {
    for await (const chunk of stream) {
      if (signal?.aborted) throw new Error("DIGEST_ABORTED");
      bytes += (chunk as Buffer).length;
      if (bytes > maxBytes) throw new Error("DIGEST_TOO_LARGE");
      hash.update(chunk as Buffer);
    }
  } finally {
    stream.destroy();
  }
  return hash.digest("hex");
}
