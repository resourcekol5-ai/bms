import { useEffect, useState } from 'react';
import { History, RefreshCw, Eye } from 'lucide-react';
import { historyRequest, type HistoryEntry } from './reportHistory';
import { formatClock, type StoredReport } from './reportGenerator';
import { RealtimeReportModal } from './RealtimeReportModal';

export function ReportHistoryView({ revision, status, retry }: { revision: number; status: string; retry: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<StoredReport | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    historyRequest<{ reports: HistoryEntry[]; hasMore: boolean }>('/api/reports?page=' + page)
      .then(data => { if (!cancelled) { setEntries(data.reports); setHasMore(data.hasMore); } })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision, page, refresh]);
  async function open(id: string) {
    setBusy(id); setError('');
    try { setSelected(await historyRequest<StoredReport>('/api/reports?id=' + id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to open report.'); }
    finally { setBusy(''); }
  }
  return <section className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2 text-cyan-300"><History size={20} /><span className="text-xs uppercase tracking-widest">Simulation archive</span></div>
        <h2 className="text-2xl font-bold text-white mt-2">Report history</h2>
        <p className="text-sm text-slate-400 mt-2 max-w-2xl">Every run is saved when it starts, every 15 seconds, and when it stops. Open a saved snapshot to inspect its cells, trends, and exports later.</p>
      </div>
      <button onClick={() => { retry(); setRefresh(v => v + 1); }} className="flex gap-2 items-center px-3 py-2 rounded-lg border border-slate-700 text-sm hover:bg-slate-800"><RefreshCw size={14} /> Refresh / retry save</button>
    </div>
    <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 text-xs text-slate-400 space-y-2">
      <p role="status" className="text-cyan-300">{status}</p>
      <p>History is private to this browser. Clearing site cookies removes access. Reports preserve captured data; long traces are sampled across their time range. Stop before leaving to save the final state.</p>
    </div>
    {error && <div role="alert" className="rounded-lg p-4 bg-rose-950/40 text-rose-300 border border-rose-900">{error} <button className="underline ml-2" onClick={() => setRefresh(v => v + 1)}>Try again</button></div>}
    {loading ? <div role="status" className="p-8 animate-pulse rounded-xl bg-slate-900 text-slate-400">Loading saved simulations…</div> :
      !error && entries.length === 0 ? <div className="border border-dashed border-slate-700 rounded-xl p-10 text-center"><History className="mx-auto text-slate-500 mb-3" /><h3 className="font-bold">Your first run starts here</h3><p className="text-sm text-slate-400 mt-2">Choose a cell model and press Run. Its report appears here automatically.</p></div> :
      <div className="space-y-3">{entries.map(entry => <article key={entry.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div><h3 className="font-bold text-white">{entry.label}</h3><p className="text-xs text-slate-400 mt-1">Started {new Date(entry.startedAt).toLocaleString()}</p>
          <p className="text-xs font-mono text-cyan-300 mt-2">{formatClock(entry.session.elapsedMs)} · {entry.session.mode.replace(/_/g, ' ')} · {entry.session.profile.replace(/_/g, ' ')}</p>
          <p className="text-[11px] text-slate-500 mt-1">Last saved {new Date(entry.updatedAt).toLocaleString()}</p></div>
        <button disabled={!!busy} onClick={() => open(entry.id)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-bold disabled:opacity-50"><Eye size={14} />{busy === entry.id ? 'Opening…' : 'Open report'}</button>
      </article>)}</div>}
    <div className="flex items-center gap-3 text-xs">
      <button disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)} className="px-3 py-2 border border-slate-700 rounded-lg disabled:opacity-30">Previous</button>
      <span>Page {page + 1}</span><button disabled={!hasMore || loading} onClick={() => setPage(p => p + 1)} className="px-3 py-2 border border-slate-700 rounded-lg disabled:opacity-30">Next</button>
    </div>
    {selected && <RealtimeReportModal isOpen onClose={() => setSelected(null)} isRunning={false} generate={() => selected} archived />}
  </section>;
}
