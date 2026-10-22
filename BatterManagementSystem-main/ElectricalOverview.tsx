import type { ReactNode } from 'react';
import { CellData, ChemistrySpec, BmsTelemetry, SessionSnapshot, SimulationMode } from '../../types/battery';
import { BmsLogEvent } from '../BmsLogsModal';
import { ElectricalState, EnergyCounters, fmtOhm } from '../../utils/electrical';
import { packSeriesFromCells } from '../../utils/chartData';
import { LiveLineChart } from '../charts/LiveLineChart';
import { DeltaBarChart } from '../charts/DeltaBarChart';
import { SingleLineDiagram } from '../electrical/SingleLineDiagram';
import { playCellClickSound } from '../../utils/audio';
import { estimateBatteryLife } from '../../utils/batteryLife';
import { currentLimitA } from '../../utils/alarmSystem';
import { ShieldCheck, Table2, Cpu, ArrowRight, FileSpreadsheet, FileText, Activity, ScrollText } from 'lucide-react';

interface Props {
  cells: CellData[];
  selectedCellId: number;
  onSelectCell: (id: number) => void;
  telemetry: BmsTelemetry;
  el: ElectricalState;
  energy: EnergyCounters;
  spec: ChemistrySpec;
  seriesCount: number;
  parallelCount: number;
  snapshots: SessionSnapshot[];
  logs: BmsLogEvent[];
  isRunning: boolean;
  mode: SimulationMode;
  onOpenChannel: () => void;
  onDownloadCellCsv: (id: number) => void;
  onDownloadCellPdf: (id: number) => void;
}

function Panel({ title, icon, right, children, className = '' }: { title: string; icon: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-[#060c18] border border-slate-800 rounded-xl ${className}`}>
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-800">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300">
          <span className="text-cyan-400">{icon}</span>
          {title}
        </div>
        {right}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

type RelayState = 'ok' | 'pickup' | 'trip';

function Lamp({ state }: { state: RelayState }) {
  const cls =
    state === 'ok'
      ? 'bg-emerald-500 shadow-[0_0_8px_#22c55e]'
      : state === 'pickup'
      ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b] animate-pulse'
      : 'bg-rose-500 shadow-[0_0_10px_#ef4444] animate-pulse';
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cls}`} />;
}

export function ElectricalOverview({
  cells,
  selectedCellId,
  onSelectCell,
  telemetry: t,
  el,
  energy,
  spec,
  seriesCount,
  parallelCount,
  snapshots,
  logs,
  isRunning,
  mode,
  onOpenChannel,
  onDownloadCellCsv,
  onDownloadCellPdf,
}: Props) {
  const derived = packSeriesFromCells(cells, seriesCount, parallelCount);
  const has = snapshots.length >= 2;
  const vSeries = has ? snapshots.map((s) => s.packVoltage) : derived.voltage;
  const iSeries = has ? snapshots.map((s) => s.packCurrent) : derived.current;
  const pSeries = has ? snapshots.map((s) => s.packPower) : vSeries.map((v, i) => v * (iSeries[i] || 0));
  const dSeries = has ? snapshots.map((s) => s.deltaMv) : derived.deltaMv;
  const batteryLife = estimateBatteryLife(t, cells, spec);

  const ocLimit = currentLimitA(t, spec).limitA;
  const ovWarn = spec.maxVoltage - 0.03;
  const uvWarn = spec.cutoffVoltage + 0.1;
  const relays: { code: string; name: string; setpoint: string; measured: string; state: RelayState }[] = [
    {
      code: '59',
      name: 'Cell over-voltage',
      setpoint: `${spec.maxVoltage.toFixed(2)} V`,
      measured: `${t.maxVoltage.toFixed(3)} V`,
      state: t.maxVoltage > spec.maxVoltage + 0.05 ? 'trip' : t.maxVoltage > ovWarn ? 'pickup' : 'ok',
    },
    {
      code: '27',
      name: 'Cell under-voltage',
      setpoint: `${spec.cutoffVoltage.toFixed(2)} V`,
      measured: `${t.minVoltage.toFixed(3)} V`,
      state: t.minVoltage < spec.cutoffVoltage - 0.05 ? 'trip' : t.minVoltage < uvWarn ? 'pickup' : 'ok',
    },
    {
      code: '50/51',
      name: 'Over-current',
      setpoint: `${ocLimit.toFixed(0)} A`,
      measured: `${Math.abs(el.current).toFixed(2)} A`,
      state: Math.abs(el.current) > ocLimit ? 'trip' : Math.abs(el.current) >= 0.85 * ocLimit ? 'pickup' : 'ok',
    },
    {
      code: '64',
      name: 'Insulation fault',
      setpoint: `${el.isolationLimitKohm.toFixed(1)} kΩ`,
      measured: fmtOhm(el.isolationKohm),
      state: !el.isolationOk ? 'trip' : el.isolationKohm < el.isolationLimitKohm * 5 ? 'pickup' : 'ok',
    },
    {
      code: '60',
      name: 'Voltage imbalance',
      setpoint: '60 mV',
      measured: `${t.deltaVoltage.toFixed(1)} mV`,
      state: t.deltaVoltage > 60 ? 'trip' : t.deltaVoltage > 25 ? 'pickup' : 'ok',
    },
    {
      code: '49',
      name: 'Thermal overload',
      setpoint: `${spec.tempMax} °C`,
      measured: `${t.maxTemperature.toFixed(1)} °C`,
      state: t.maxTemperature > spec.tempMax ? 'trip' : t.maxTemperature > spec.tempMax - 10 ? 'pickup' : 'ok',
    },
  ];

  const measurements: [string, string][] = [
    ['Pack terminal voltage', `${t.packVoltage.toFixed(3)} V`],
    ['DC-link voltage', `${el.linkVoltage.toFixed(3)} V`],
    ['Shunt current', `${el.current.toFixed(3)} A`],
    ['Shunt voltage', `${el.shuntMv.toFixed(3)} mV`],
    ['Bus power', `${el.powerW.toFixed(1)} W`],
    ['C-rate', `${el.cRate.toFixed(3)} C`],
    ['Pack DCIR (string)', `${el.packResistanceMohm.toFixed(2)} mΩ`],
    ['Internal I²R loss', `${el.ohmicLossW.toFixed(2)} W`],
    ['Cell V max / min / avg', `${t.maxVoltage.toFixed(3)} / ${t.minVoltage.toFixed(3)} / ${t.avgVoltage.toFixed(3)} V`],
    ['Balancing channels', `${el.balancingChannels} · ${el.balancingPowerW.toFixed(2)} W bleed`],
    ['Energy out / in', `${energy.whOut.toFixed(2)} / ${energy.whIn.toFixed(2)} Wh`],
    ['Peak discharge / charge', `${energy.peakDischargeA.toFixed(1)} / ${energy.peakChargeA.toFixed(1)} A`],
    ['Battery runtime', `${batteryLife.runtimeText} · ${batteryLife.runtimeContext}`],
    ['Service-life reserve', `${batteryLife.remainingCycles.toLocaleString()} cycles · ≈ ${batteryLife.estimatedServiceYears.toFixed(1)} yr @ 1 cycle/day`],
  ];

  const sel = cells.find((c) => c.id === selectedCellId) || cells[0];
  const selI = sel?.history[sel.history.length - 1]?.current ?? 0;
  const vRange = spec.maxVoltage - spec.cutoffVoltage;
  const cols = Math.min(cells.length, seriesCount <= 4 ? seriesCount : 4);

  return (
    <div className="space-y-4">
      <Panel
        title="Single-line diagram"
        icon={<Cpu className="w-4 h-4" />}
        right={
          <span className={`text-[10px] font-mono ${isRunning ? 'text-emerald-400' : 'text-slate-500'}`}>
            {isRunning ? '● LIVE' : '○ HOLD'} · mode {mode.replace(/_/g, ' ')}
          </span>
        }
      >
        <SingleLineDiagram el={el} mode={mode} topology={`${seriesCount}S${parallelCount}P`} cellType={spec.shortName} soc={t.packSoC} />
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Panel title="Protection relays" icon={<ShieldCheck className="w-4 h-4" />} className="xl:col-span-5">
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <table className="w-full text-[11px] font-mono">
              <thead className="bg-slate-900 text-slate-500">
                <tr>
                  <th className="text-left px-2 py-1.5 font-semibold">ANSI</th>
                  <th className="text-left px-2 py-1.5 font-semibold">Function</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Setpoint</th>
                  <th className="text-right px-2 py-1.5 font-semibold">Measured</th>
                  <th className="text-center px-2 py-1.5 font-semibold">State</th>
                </tr>
              </thead>
              <tbody>
                {relays.map((r) => (
                  <tr key={r.code} className="border-t border-slate-800">
                    <td className="px-2 py-1.5 text-cyan-300 font-bold">{r.code}</td>
                    <td className="px-2 py-1.5 text-slate-300">{r.name}</td>
                    <td className="px-2 py-1.5 text-right text-slate-500">{r.setpoint}</td>
                    <td className="px-2 py-1.5 text-right text-slate-100">{r.measured}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-center gap-1.5">
                        <Lamp state={r.state} />
                        <span className={`text-[9px] font-bold ${r.state === 'ok' ? 'text-emerald-400' : r.state === 'pickup' ? 'text-amber-400' : 'text-rose-400'}`}>
                          {r.state === 'ok' ? 'NORMAL' : r.state === 'pickup' ? 'PICKUP' : 'TRIP'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Measurements" icon={<Table2 className="w-4 h-4" />} className="xl:col-span-7">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            {measurements.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-1.5 border-b border-slate-800/80 text-[11px] font-mono">
                <span className="text-slate-500">{k}</span>
                <span className="text-slate-100 tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Panel
          title="Cell voltage channels"
          icon={<Activity className="w-4 h-4" />}
          className="xl:col-span-8"
          right={<span className="text-[10px] font-mono text-slate-500">window {spec.cutoffVoltage.toFixed(2)}–{spec.maxVoltage.toFixed(2)} V</span>}
        >
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {cells.map((c) => {
              const selected = c.id === selectedCellId;
              const pos = Math.max(0, Math.min(100, ((c.voltage - spec.cutoffVoltage) / vRange) * 100));
              const dev = (c.voltage - t.avgVoltage) * 1000;
              const fault = c.faultType !== 'none';
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    playCellClickSound(500 + c.id * 20);
                    onSelectCell(c.id);
                  }}
                  className={`text-left rounded-lg border px-2.5 py-2 cursor-pointer transition ${
                    selected ? 'border-cyan-400 bg-cyan-500/10' : fault ? 'border-rose-500/60 bg-rose-500/5' : 'border-slate-800 bg-[#081022] hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span className="text-slate-400 font-bold">CH{String(c.id).padStart(2, '0')}</span>
                    <span className="flex items-center gap-1">
                      {c.isBalancing && <span className="text-amber-400 font-bold">BAL</span>}
                      {fault && <span className="text-rose-400 font-bold">FLT</span>}
                    </span>
                  </div>
                  <div className="font-mono text-[17px] font-bold text-white tabular-nums leading-tight">
                    {c.voltage.toFixed(3)}
                    <span className="text-[10px] text-slate-500 font-normal ml-0.5">V</span>
                  </div>
                  <div className="relative h-1.5 mt-1 rounded-full bg-slate-800">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-700 to-cyan-300" style={{ width: `${pos}%` }} />
                    <div className="absolute -top-0.5 w-px h-2.5 bg-amber-400" style={{ left: `${((uvWarn - spec.cutoffVoltage) / vRange) * 100}%` }} />
                    <div className="absolute -top-0.5 w-px h-2.5 bg-rose-400" style={{ left: `${((ovWarn - spec.cutoffVoltage) / vRange) * 100}%` }} />
                  </div>
                  <div className="flex justify-between mt-1 text-[9.5px] font-mono">
                    <span className={dev >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
                      {dev >= 0 ? '+' : ''}
                      {dev.toFixed(1)} mV
                    </span>
                    <span className="text-slate-500">{c.internalResistance.toFixed(1)} mΩ</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        {sel && (
          <Panel title={`Channel CH${String(sel.id).padStart(2, '0')}`} icon={<Cpu className="w-4 h-4" />} className="xl:col-span-4">
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mb-3">
              {[
                ['Terminal V', `${sel.voltage.toFixed(4)} V`],
                ['Cell current', `${selI.toFixed(3)} A`],
                ['IR drop', `${(selI * sel.internalResistance).toFixed(1)} mV`],
                ['I²R heat', `${(selI * selI * (sel.internalResistance / 1000)).toFixed(3)} W`],
                ['Polarization', `${((sel.polarization ?? 0) * 1000).toFixed(1)} mV`],
                ['Bleed', sel.isBalancing ? `${sel.balanceBleedCurrent} mA` : 'off'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md border border-slate-800 bg-[#081022] px-2 py-1.5">
                  <div className="text-[9.5px] text-slate-500">{k}</div>
                  <div className="text-slate-100 tabular-nums">{v}</div>
                </div>
              ))}
            </div>
            <LiveLineChart
              compact
              height={120}
              series={[
                { id: 'v', label: 'V', color: '#22d3ee', values: sel.history.map((h) => h.voltage), fill: true, unit: 'V', minSpan: 0.05, digits: 3 },
                { id: 'i', label: 'I', color: '#fbbf24', values: sel.history.map((h) => h.current), axis: 'right', dashed: true, unit: 'A', minSpan: 0.8, digits: 2 },
              ]}
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={onOpenChannel} className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-bold cursor-pointer">
                Channel detail <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDownloadCellCsv(sel.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold cursor-pointer">
                <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
              </button>
              <button onClick={() => onDownloadCellPdf(sel.id)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-bold cursor-pointer">
                <FileText className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          </Panel>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Bus voltage & current" icon={<Activity className="w-4 h-4" />}>
          <LiveLineChart
            compact
            height={170}
            series={[
              { id: 'v', label: 'Vpack', color: '#22d3ee', values: vSeries, fill: true, unit: 'V', minSpan: 0.08, digits: 3 },
              { id: 'i', label: 'I', color: '#fbbf24', values: iSeries, axis: 'right', dashed: true, unit: 'A', minSpan: 1, digits: 2 },
            ]}
          />
        </Panel>
        <Panel title="Power & imbalance" icon={<Activity className="w-4 h-4" />}>
          <LiveLineChart
            compact
            height={170}
            series={[
              { id: 'p', label: 'P', color: '#a78bfa', values: pSeries, fill: true, unit: 'W', minSpan: 5, digits: 1 },
              { id: 'd', label: 'ΔV', color: '#f59e0b', values: dSeries, axis: 'right', dashed: true, unit: 'mV', minSpan: 8, digits: 1 },
            ]}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <Panel title="Cell deviation from mean (mV)" icon={<Activity className="w-4 h-4" />} className="xl:col-span-8">
          <DeltaBarChart cells={cells} meanVoltage={t.avgVoltage} selectedId={selectedCellId} onSelect={onSelectCell} />
        </Panel>
        <Panel title="Event log" icon={<ScrollText className="w-4 h-4" />} className="xl:col-span-4">
          <div className="space-y-1 max-h-[280px] overflow-y-auto font-mono text-[11px]">
            {logs.slice(0, 12).map((l) => (
              <div key={l.id} className="rounded-md border border-slate-800 bg-[#081022] px-2 py-1.5">
                <span className="text-slate-500">{l.timestamp}</span>{' '}
                <span className={`uppercase text-[9px] font-bold ${l.type === 'fault' ? 'text-rose-400' : l.type === 'warning' ? 'text-amber-400' : l.type === 'balance' ? 'text-cyan-400' : 'text-slate-400'}`}>
                  {l.type}
                </span>
                <div className="text-slate-300 line-clamp-2">{l.message}</div>
              </div>
            ))}
            {logs.length === 0 && <div className="text-slate-500 text-center py-6">No events</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
