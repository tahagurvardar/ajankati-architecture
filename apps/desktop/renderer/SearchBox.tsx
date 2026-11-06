import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Snapshot } from "@ajankati/contracts";
import type { Route } from "./AppShell";
import { officeRoles } from "./agentView";

export type SearchTarget = { route: Route; projectId?: string };
type Hit = { key: string; kind: string; label: string; target: SearchTarget };

const fold = (value: string) => value.toLocaleLowerCase("tr-TR");

/** Searches only local snapshot records and static role names. Nothing leaves the renderer. */
export function SearchBox({
  data,
  onSelect,
}: {
  data: Snapshot | null;
  onSelect: (target: SearchTarget) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  const needle = fold(query.trim());
  const hits: Hit[] = [];
  if (needle) {
    for (const project of data?.projects ?? [])
      if (fold(project.name).includes(needle))
        hits.push({
          key: `p-${project.id}`,
          kind: "Proje",
          label: project.name,
          target: { route: "projects", projectId: project.id },
        });
    for (const task of data?.tasks ?? [])
      if (fold(task.title).includes(needle))
        hits.push({
          key: `t-${task.id}`,
          kind: `Görev · ${data?.projects.find((p) => p.id === task.projectId)?.name ?? "Proje"}`,
          label: task.title,
          target: { route: "projects", projectId: task.projectId },
        });
    for (const role of officeRoles)
      if (fold(role.name).includes(needle))
        hits.push({
          key: `a-${role.key}`,
          kind: "Ajan",
          label: role.name,
          target: { route: "agents" },
        });
  }
  function pick(hit: Hit) {
    setQuery("");
    onSelect(hit.target);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && query) {
      event.stopPropagation();
      setQuery("");
      input.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(
      results.current?.querySelectorAll<HTMLElement>("button") ?? [],
    );
    if (items.length === 0) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown"
        ? (at + 1) % items.length
        : at <= 0
          ? (input.current?.focus(), -1)
          : at - 1;
    if (next >= 0) items[next]!.focus();
  }
  return (
    <div className="search-box" role="search" onKeyDown={onKeyDown}>
      <label className="search-field">
        <span aria-hidden="true">⌕</span>
        <input
          ref={input}
          type="search"
          aria-label="Ara"
          aria-keyshortcuts="Control+K"
          placeholder="Proje, görev veya ajan ara…"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd aria-hidden="true">Ctrl K</kbd>
      </label>
      {needle && (
        <div className="search-results">
          {hits.length === 0 ? (
            <p role="status">Eşleşen yerel kayıt yok.</p>
          ) : (
            <ul ref={results} aria-label="Arama sonuçları">
              {hits.slice(0, 8).map((hit) => (
                <li key={hit.key}>
                  <button className="search-hit" onClick={() => pick(hit)}>
                    <strong>{hit.label}</strong>
                    <small>{hit.kind}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
