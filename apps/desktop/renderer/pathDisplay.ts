/**
 * Readable one-line form of a long path: root, an ellipsis, then as many
 * trailing segments as fit. Display only; callers keep the exact original.
 */
export function shortenPath(path: string, max = 46): string {
  if (path.length <= max) return path;
  const sep = path.includes("\\") ? "\\" : "/";
  const parts = path.split(sep);
  let root = "";
  let rest: string[];
  if (path.startsWith("\\\\") && parts.length > 4) {
    root = `${sep}${sep}${parts[2]}${sep}${parts[3]}`;
    rest = parts.slice(4);
  } else if (/^[A-Za-z]:$/.test(parts[0] ?? "")) {
    root = parts[0]!;
    rest = parts.slice(1);
  } else {
    rest = parts.slice(path.startsWith(sep) ? 1 : 0);
  }
  if (rest.length <= 2) return path;
  const kept = [rest.at(-1)!];
  for (let i = rest.length - 2; i >= 0; i--) {
    const candidate = `${root}${sep}…${sep}${[rest[i]!, ...kept].join(sep)}`;
    // Always keep the parent folder so the file has context.
    if (kept.length >= 2 && candidate.length > max) break;
    kept.unshift(rest[i]!);
  }
  if (kept.length === rest.length) return path;
  return `${root}${sep}…${sep}${kept.join(sep)}`;
}
