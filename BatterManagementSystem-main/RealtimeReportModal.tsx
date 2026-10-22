import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  X,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Activity,
  Zap,
  Thermometer,
  Gauge,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import type { StoredReport } from '../utils/reportGenerator';
import {
  downloadPackPdf,
  downloadAllCellsPdf,
  downloadCellPdf,
  formatClock,
} from '../utils/reportGenerator';
import { downloadPackCsv, downloadCellsCsv, downloadCellCsv } from '../utils/csvExport';
import { LiveLineChart } from './charts/LiveLineChart';
import { packSeriesFromCells } from '../utils/chartData';
import { playCellClickSound } from '../utils/audio';

interface RealtimeReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  isRunning: boolean;
  /** Builds a report from the live pack state at the instant it is called. */
  generate: () => StoredReport;
}

function Kpi({ label, value, unit, sub, accent, icon }: {
  label: string; value: string; unit?: string; sub: string; accent: string; icon: ReactNode;
}) {
  return (
    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">
        <span>{label}</span>
        <span className={accent}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-mono font-bold ${accent}`}>{value}</span>
        {unit && <span className="text-[10px] text-slate-500">{unit}</span>}
      </div>
      <div className="text-[10px] text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

function ExportTile({
  kind,
  title,
  sub,
  onClick,
}: {
  kind: 'csv' | 'pdf';
  title: string;
  sub: string;
  onClick: () => void;
}) {
  const isCsv = kind === 'csv';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-left border transition cursor-pointer active:scale-[0.99] ${
        isCsv
          ? 'bg-emerald-950/40 border-emerald-800/70 hover:bg-emerald-900/40 hover:border-emerald-500'
          : 'bg-rose-950/40 border-rose-900/70 hover:bg-rose-900/40 hover:border-rose-500'
      }`}
    >
      <span className={isCsv ? 'text-emerald-400' : 'text-rose-400'}>
        {isCsv ? <FileSpreadsheet className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-white">{title}</span>
        <span className="block text-[11px] text-slate-400 truncate">{sub}</span>
      </span>
    </button>
  );
}

export function RealtimeReportModal({ isOpen, onClose, isRunning, generate }: RealtimeReportModalProps) {
  const [cellId, setCellId] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<StoredReport | null>(null);

  // Generate the moment the view opens, and keep it current while the sim runs.
  useEffect(() => {
    if (!isOpen) {
      setReport(null);
      return;
    }
    setReport(generate());
    if (!isRunning) return;
    const id = setInterval(() => setReport(generate()), 1000);
    return () => clearInterval(id);
  }, [isOpen, isRunning, generate]);

  const derived = useMemo(() => {
    if (!report) return null;
    return packSeriesFromCells(report.ctx.cells, report.ctx.seriesCount, report.ctx.parallelCount);
  }, [report]);

  if (!isOpen) return null;

  // All exports run SYNCHRONOUSLY inside the click handler (keeps the browser user-gesture)
  const run = (fn: (snap: StoredReport) => unknown) => {
    setError(null);
    try {
      // Regenerate so the downloaded file matches this exact moment
      const fresh = generate();
      setReport(fresh);
      fn(fresh);
      playCellClickSound(820);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const ctx = report?.ctx;
  const t = ctx?.telemetry;
  const validCellId = ctx?.cells.some((c) => c.id === cellId) ? cellId : ctx?.cells[0]?.id ?? 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-5xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-md p-5 border-b border-slate-800 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Live report
                <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                  isRunning ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}>
                  <Lock className="w-3 h-3" /> {isRunning ? 'auto-refreshing' : 'generated now'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                {report
                  ? `${report.id} · captured ${new Date(report.createdAt).toLocaleTimeString()} · ${report.session.chemistry} ${report.session.topology} · run ${formatClock(report.session.elapsedMs)} · ${report.session.tickCount} ticks`
                  : 'No report captured yet'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {!report && (
            <div className="p-6 rounded-2xl border border-slate-800 bg-slate-950/70 text-center text-sm text-slate-300">
              Generating report from the current pack state…
            </div>
          )}

          {report && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setReport(generate())}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Regenerate now
                </button>
                <span className="text-[11px] text-slate-500">
                  Nothing here is pre-recorded — the figures are read from the pack the moment you open, refresh or download.
                </span>
              </div>

              {/* Download grid */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <div className="text-sm font-bold text-white">Download — generated at the click instant</div>
                  <label className="flex items-center gap-2 text-[11px] text-slate-400">
                    Cell
                    <select
                      value={validCellId}
                      onChange={(e) => setCellId(Number(e.target.value))}
                      className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs font-mono text-slate-100 cursor-pointer"
                    >
                      {ctx!.cells.map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.id} · {c.voltage.toFixed(3)} V
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ExportTile kind="csv" title="Full pack CSV" sub="Summary + all cells in one Excel sheet" onClick={() => run((r) => downloadPackCsv(r.ctx))} />
                  <ExportTile kind="pdf" title="Full pack PDF" sub="Printable engineering dossier" onClick={() => run((r) => downloadPackPdf(r.ctx))} />
                  <ExportTile kind="csv" title="All cells CSV" sub={`${ctx!.cells.length} cells, one row each — Excel-ready`} onClick={() => run((r) => downloadCellsCsv(r.ctx))} />
                  <ExportTile kind="pdf" title="All cells PDF" sub="Per-cell booklet" onClick={() => run((r) => downloadAllCellsPdf(r.ctx))} />
                  <ExportTile kind="csv" title={`Cell #${validCellId} CSV`} sub="Metrics + voltage/temperature history" onClick={() => run((r) => downloadCellCsv(r.ctx, validCellId))} />
                  <ExportTile kind="pdf" title={`Cell #${validCellId} PDF`} sub="Selected cell channel" onClick={() => run((r) => downloadCellPdf(r.ctx, validCellId))} />
                </div>

                {error && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4" /> Export failed: {error}
                  </div>
                )}
                <p className="mt-3 text-[11px] text-slate-500">
                  Files download straight to your browser — check the download bar or your Downloads folder.
                </p>
              </div>

              {t && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <Kpi label="Pack voltage" value={t.packVoltage.toFixed(2)} unit="V" sub={`mean ${t.avgVoltage.toFixed(3)} V/cell`} accent="text-white" icon={<Zap className="w-3.5 h-3.5" />} />
                  <Kpi label="Pack current" value={`${t.packCurrent > 0 ? '+' : ''}${t.packCurrent.toFixed(1)}`} unit="A" sub={`${Math.abs(t.packPower).toFixed(0)} W`} accent="text-amber-400" icon={<Gauge className="w-3.5 h-3.5" />} />
                  <Kpi label="SoC" value={t.packSoC.toFixed(1)} unit="%" sub={`${t.packEnergyRemaining.toFixed(0)} Wh left`} accent="text-cyan-400" icon={<Activity className="w-3.5 h-3.5" />} />
                  <Kpi label="Peak temp" value={t.maxTemperature.toFixed(1)} unit="°C" sub={`cell #${t.maxTempCellId}`} accent="text-rose-400" icon={<Thermometer className="w-3.5 h-3.5" />} />
                </div>
              )}

              {derived && (
                <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-bold text-white">Pack voltage & current</div>
                    <span className="text-[10px] font-mono text-slate-500">{derived.voltage.length} samples</span>
                  </div>
                  <LiveLineChart
                    compact
                    height={180}
                    series={[
                      { id: 'v', label: 'Vpack', color: '#22d3ee', values: derived.voltage, fill: true, unit: 'V', minSpan: 0.08, digits: 3 },
                      { id: 'i', label: 'Ipack', color: '#fbbf24', values: derived.current, axis: 'right', dashed: true, unit: 'A', minSpan: 1, digits: 2 },
                    ]}
                  />
                </div>
              )}

              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-bold text-white">Cell snapshot</div>
                  <span className="text-[10px] font-mono text-slate-500">{ctx!.cells.length} cells</span>
                </div>
                <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-slate-800">
                  <table className="w-full text-[11px] font-mono">
                    <thead className="bg-slate-900 text-slate-400 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1.5">#</th>
                        <th className="text-right px-2 py-1.5">Voltage</th>
                        <th className="text-right px-2 py-1.5">SoC</th>
                        <th className="text-right px-2 py-1.5">Temp</th>
                        <th className="text-right px-2 py-1.5">IR</th>
                        <th className="text-left px-2 py-1.5">Status</th>
                        <th className="text-right px-2 py-1.5">Export</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ctx!.cells.map((c) => (
                        <tr key={c.id} className={`border-t border-slate-800 text-slate-300 ${c.id === validCellId ? 'bg-cyan-500/5' : ''}`}>
                          <td className="px-2 py-1.5 text-white font-bold">{c.id}</td>
                          <td className="px-2 py-1.5 text-right text-cyan-300">{c.voltage.toFixed(3)} V</td>
                          <td className="px-2 py-1.5 text-right text-emerald-300">{c.soc.toFixed(2)}%</td>
                          <td className={`px-2 py-1.5 text-right ${c.temperature > 50 ? 'text-rose-400' : 'text-slate-300'}`}>{c.temperature.toFixed(1)}°C</td>
                          <td className="px-2 py-1.5 text-right text-purple-300">{c.internalResistance.toFixed(1)} mΩ</td>
                          <td className="px-2 py-1.5 text-slate-400">{c.faultType !== 'none' ? c.faultType.replace(/_/g, ' ') : c.status}</td>
                          <td className="px-2 py-1">
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => run((r) => downloadCellCsv(r.ctx, c.id))}
                                className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold cursor-pointer"
                              >
                                CSV
                              </button>
                              <button
                                onClick={() => run((r) => downloadCellPdf(r.ctx, c.id))}
                                className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-bold cursor-pointer"
                              >
                                PDF
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                <div className="text-xs font-bold text-white mb-2">Event log at capture</div>
                <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-[11px]">
                  {ctx!.logs.slice(0, 20).map((l) => (
                    <div key={l.id} className="bg-slate-900/70 border border-slate-800 rounded-md px-2 py-1.5">
                      <span className="text-slate-500">{l.timestamp}</span>{' '}
                      <span className={l.type === 'fault' ? 'text-rose-400' : l.type === 'warning' ? 'text-amber-400' : 'text-slate-300'}>{l.type}</span>{' '}
                      <span className="text-slate-300">{l.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
