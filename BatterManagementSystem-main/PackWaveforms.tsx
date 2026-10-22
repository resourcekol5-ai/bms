import { Activity, Gauge, Thermometer, Zap } from 'lucide-react';
import { CellData, SessionSnapshot } from '../types/battery';
import { packSeriesFromCells } from '../utils/chartData';
import { LiveLineChart } from './charts/LiveLineChart';

interface PackWaveformsProps {
  cells: CellData[];
  seriesCount: number;
  parallelCount: number;
  snapshots: SessionSnapshot[];
  isRunning: boolean;
}

export function PackWaveforms({
  cells,
  seriesCount,
  parallelCount,
  snapshots,
  isRunning,
}: PackWaveformsProps) {
  const derived = packSeriesFromCells(cells, seriesCount, parallelCount);

  const packV = snapshots.length >= 2 ? snapshots.map((s) => s.packVoltage) : derived.voltage;
  const packI = snapshots.length >= 2 ? snapshots.map((s) => s.packCurrent) : derived.current;
  const packSoc = snapshots.length >= 2 ? snapshots.map((s) => s.packSoC) : derived.soc;
  const packT = snapshots.length >= 2 ? snapshots.map((s) => s.avgTemp) : derived.temp;
  const packD = snapshots.length >= 2 ? snapshots.map((s) => s.deltaMv) : derived.deltaMv;
  const packP = snapshots.length >= 2 ? snapshots.map((s) => s.packPower) : packV.map((v, i) => v * (packI[i] || 0));

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-2xl backdrop-blur-md space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-wide">Live Pack Waveforms</h3>
            <p className="text-xs text-slate-400">
              Auto-scaled traces from the analog front-end. Y-axis tightens around the live signal so millivolt and degree changes are visible.
            </p>
          </div>
        </div>
        <span
          className={`text-[10px] font-mono px-2 py-1 rounded-lg border ${
            isRunning
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}
        >
          {isRunning ? 'SAMPLING LIVE' : 'FROZEN / LAST BUFFER'} · {packV.length} pts
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-slate-200">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            Pack Voltage & Cell Delta
          </div>
          <LiveLineChart
            height={200}
            series={[
              {
                id: 'vpack',
                label: 'Vpack',
                color: '#22d3ee',
                values: packV,
                axis: 'left',
                fill: true,
                unit: 'V',
                minSpan: 0.08,
                digits: 3,
              },
              {
                id: 'dv',
                label: 'ΔV',
                color: '#f59e0b',
                values: packD,
                axis: 'right',
                dashed: true,
                unit: 'mV',
                minSpan: 8,
                digits: 1,
              },
            ]}
          />
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-slate-200">
            <Gauge className="w-3.5 h-3.5 text-amber-400" />
            Pack Current & Power
          </div>
          <LiveLineChart
            height={200}
            series={[
              {
                id: 'ipack',
                label: 'Current',
                color: '#fbbf24',
                values: packI,
                axis: 'left',
                fill: true,
                unit: 'A',
                minSpan: 1,
                digits: 2,
              },
              {
                id: 'ppack',
                label: 'Power',
                color: '#a78bfa',
                values: packP,
                axis: 'right',
                dashed: true,
                unit: 'W',
                minSpan: 5,
                digits: 1,
              },
            ]}
          />
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-slate-200">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            State of Charge
          </div>
          <LiveLineChart
            height={200}
            series={[
              {
                id: 'soc',
                label: 'Pack SoC',
                color: '#34d399',
                values: packSoc,
                axis: 'left',
                fill: true,
                unit: '%',
                minSpan: 3,
                digits: 1,
              },
            ]}
          />
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-slate-200">
            <Thermometer className="w-3.5 h-3.5 text-rose-400" />
            Thermal Envelope
          </div>
          <LiveLineChart
            height={200}
            series={[
              {
                id: 'tavg',
                label: 'Avg temp',
                color: '#fb7185',
                values: packT,
                axis: 'left',
                fill: true,
                unit: 'C',
                minSpan: 2,
                digits: 1,
              },
              {
                id: 'tmax',
                label: 'Peak temp',
                color: '#f97316',
                values: snapshots.length >= 2 ? snapshots.map((s) => s.maxTemp) : packT,
                axis: 'left',
                dashed: true,
                unit: 'C',
                minSpan: 2,
                digits: 1,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
