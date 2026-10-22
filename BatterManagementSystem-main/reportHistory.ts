import { useEffect, useRef, useState } from 'react';
import { createStoredReport, type ReportContext, type StoredReport } from './reportGenerator';

export type HistoryEntry = Pick<StoredReport, 'id' | 'label' | 'session'> & { startedAt: string; updatedAt: string };
export async function historyRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(20000), ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to access report history.');
  }
  return response.json();
}

// Sample evenly across the run so stored reports retain the full time range.
function sample<T>(points: T[], limit: number): T[] {
  if (points.length <= limit) return points;
  return Array.from({ length: limit }, (_, i) => points[Math.round(i * (points.length - 1) / (limit - 1))]);
}
export function useReportHistory(isRunning: boolean, ctx: ReportContext) {
  const latest = useRef(ctx);
  latest.current = ctx;
  const active = useRef<{ id: string; startedAt: string; ctx: ReportContext } | null>(null);
  if (active.current && active.current.ctx.chemistrySpec.id === ctx.chemistrySpec.id &&
    active.current.ctx.seriesCount === ctx.seriesCount && active.current.ctx.parallelCount === ctx.parallelCount &&
    ctx.elapsedMs >= active.current.ctx.elapsedMs) active.current.ctx = ctx;
  const pending = useRef<{ id: string; startedAt: string; report: StoredReport } | null>(null);
  const queue = useRef(Promise.resolve());
  const failed = useRef(new Map<string, NonNullable<typeof pending.current>>());
  const [status, setStatus] = useState('Run a simulation to save a report.');
  const [revision, setRevision] = useState(0);
  const save = (final = false) => {
    if (!active.current) return;
    const report = createStoredReport({ ...active.current.ctx, isRunning: final ? false : active.current.ctx.isRunning });
    report.id = active.current.id;
    report.ctx = { ...report.ctx, cells: report.ctx.cells.map(c => ({ ...c, history: sample(c.history, 60) })),
      snapshots: sample(report.ctx.snapshots, 600), logs: report.ctx.logs.slice(-500) };
    pending.current = structuredClone({ id: active.current.id, startedAt: active.current.startedAt, report });
    submit();
  };
  function submit(body = pending.current) {
    if (!body) return;
    setStatus('Saving report…');
    queue.current = queue.current.catch(() => {}).then(async () => {
      try {
        await historyRequest('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: false });
        if (pending.current === body) pending.current = null;
        failed.current.delete(body.id);
        setStatus('Report saved to history.');
        setRevision(v => v + 1);
      } catch (error) {
        failed.current.set(body.id, body);
        setStatus(error instanceof Error ? error.message : 'Report could not be saved.');
      }
    });
  }
  useEffect(() => {
    if (isRunning) {
      active.current = { id: crypto.randomUUID(), startedAt: new Date().toISOString(), ctx: latest.current };
      save();
      const timer = window.setInterval(() => save(), 15000);
      return () => {
        window.clearInterval(timer);
        save(true);
        active.current = null;
      };
    }
    // The timer reads the latest context through a ref, without restarting the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, ctx.chemistrySpec.id, ctx.seriesCount, ctx.parallelCount]);
  return { status, revision, retry: () => {
    for (const body of failed.current.values()) submit(body);
    if (pending.current && !failed.current.has(pending.current.id)) submit();
  } };
}
