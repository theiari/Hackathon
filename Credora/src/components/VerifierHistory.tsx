import { useMemo, useState } from "react";
import type { VerifyResponse } from "../notarizationApi";
import { StatusBadge } from "./StatusBadge";

export interface VerifyTimelineEntry {
  capturedAt: string;
  response: VerifyResponse;
}

export function VerifierHistory({ entries }: { entries: VerifyTimelineEntry[] }) {
  const [filterIssuer, setFilterIssuer] = useState("");
  const [filterDomain, setFilterDomain] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const filtered = useMemo(() => {
    return entries.filter((entry) => {
      const issuer = JSON.stringify(entry.response.issuer ?? "").toLowerCase();
      const domain = JSON.stringify(entry.response.domain ?? "").toLowerCase();
      const status = entry.response.status.toLowerCase();
      return (
        (!filterIssuer.trim() || issuer.includes(filterIssuer.trim().toLowerCase())) &&
        (!filterDomain.trim() || domain.includes(filterDomain.trim().toLowerCase())) &&
        (!filterStatus.trim() || status.includes(filterStatus.trim().toLowerCase()))
      );
    });
  }, [entries, filterIssuer, filterDomain, filterStatus]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "verification-report.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-obsidian-700 bg-obsidian-900 p-6 shadow-md">
      <h3 className="text-xl font-semibold text-obsidian-100">Verifier History</h3>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <input className="border border-obsidian-700 rounded-lg px-3 py-2 bg-obsidian-950 text-sm text-obsidian-100" placeholder="Filter issuer" value={filterIssuer} onChange={(e) => setFilterIssuer(e.target.value)} />
        <input className="border border-obsidian-700 rounded-lg px-3 py-2 bg-obsidian-950 text-sm text-obsidian-100" placeholder="Filter domain" value={filterDomain} onChange={(e) => setFilterDomain(e.target.value)} />
        <input className="border border-obsidian-700 rounded-lg px-3 py-2 bg-obsidian-950 text-sm text-obsidian-100" placeholder="Filter status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-obsidian-400">Results: {filtered.length} / {entries.length}</p>
        <button className="rounded-lg bg-gold-500 px-3 py-2 text-xs font-semibold text-obsidian-100 hover:bg-gold-700" onClick={exportJson}>Export JSON</button>
      </div>

      <div className="mt-4 space-y-3">
        {filtered.slice(0, 30).map((entry) => (
          <div key={`${entry.response.request_id}-${entry.capturedAt}`} className="rounded-lg border border-obsidian-700 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge status={entry.response.status} />
              <span className="text-xs text-obsidian-400">{entry.capturedAt}</span>
            </div>
            <p className="mt-2 text-sm text-obsidian-200">{entry.response.summary}</p>
            <p className="mt-1 text-xs text-obsidian-400">ID: {entry.response.id} • policy={entry.response.policy_version} • latency={entry.response.latency_ms}ms • cache={entry.response.cache_hit ? "hit" : "miss"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
