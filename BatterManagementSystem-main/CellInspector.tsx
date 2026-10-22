import React from 'react';
import { CellData, ChemistrySpec, SimulationMode } from '../types/battery';
import { LiveLineChart } from './charts/LiveLineChart';
import { calculateOcvFromSoc } from '../utils/simulation';
import { estimateCellLife } from '../utils/batteryLife';
import { 
  Zap, 
  Thermometer, 
  Activity, 
  ShieldAlert, 
  RotateCcw, 
  Sliders, 
  TrendingUp, 
  Flame,
  BatteryMedium,
  CheckCircle,
  AlertTriangle,
  Radio,
  RefreshCw,
  Cpu,
  FileSpreadsheet,
  FileText,
  Layers,
  Clock3
} from 'lucide-react';
import { playCellClickSound, playAlarmSound } from '../utils/audio';

interface CellInspectorProps {
  cell: CellData;
  chemistrySpec: ChemistrySpec;
  simulationMode: SimulationMode;
  packAvgVoltage: number;
  onUpdateCellVoltage: (cellId: number, newVoltage: number) => void;
  onInjectCellFault: (cellId: number, fault: CellData['faultType']) => void;
  onToggleCellBalance: (cellId: number) => void;
  onHealCell: (cellId: number) => void;
  onDownloadCellCsv: (cellId: number) => void;
  onDownloadCellPdf: (cellId: number) => void;
}

export const CellInspector: React.FC<CellInspectorProps> = ({
  cell,
  chemistrySpec,
  simulationMode,
  packAvgVoltage,
  onUpdateCellVoltage,
  onInjectCellFault,
  onToggleCellBalance,
  onHealCell,
  onDownloadCellCsv,
  onDownloadCellPdf,
}) => {
  const deltaFromPackAvg = (cell.voltage - packAvgVoltage) * 1000; // in mV
  const voltages = cell.history.map((h) => h.voltage);
  const currents = cell.history.map((h) => h.current);
  const temps = cell.history.map((h) => h.temperature);
  const socs = cell.history.map((h) => h.soc);
  const cellI = cell.history[cell.history.length - 1]?.current ?? 0;
  const vrc = cell.polarization ?? 0;
  const ocv = calculateOcvFromSoc(cell.soc, chemistrySpec.id);
  const life = estimateCellLife(cell, chemistrySpec);

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-2xl backdrop-blur-md space-y-6">
      {/* Header: Title & Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <BatteryMedium className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white tracking-wide">
                Cell channel CH{String(cell.id).padStart(2, '0')} · {cell.label}
              </h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-mono border ${chemistrySpec.badgeBg}`}>
                {chemistrySpec.shortName}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Per-channel voltage, current, impedance and balancing telemetry from the analog front-end.
            </p>
          </div>
        </div>

        {/* Status indicator badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {cell.faultType !== 'none' ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-mono font-bold animate-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>FAULT: {cell.faultType.replace('_', ' ').toUpperCase()}</span>
            </div>
          ) : cell.isBalancing ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold">
              <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              <span>BALANCING (-{cell.balanceBleedCurrent}mA)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-mono font-bold">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>STATUS: OPTIMAL</span>
            </div>
          )}

          <button
            onClick={() => {
              playCellClickSound(760);
              onDownloadCellCsv(cell.id);
            }}
            title="Download this cell as CSV (Excel-ready)"
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition border border-emerald-500/30 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          <button
            onClick={() => {
              onDownloadCellPdf(cell.id);
              playCellClickSound(780);
            }}
            title="Download this cell as PDF"
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 transition border border-rose-500/30 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF</span>
          </button>

          <button
            onClick={() => {
              playCellClickSound(900);
              onHealCell(cell.id);
            }}
            title="Restore cell to healthy state & pack mean"
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition border border-slate-700 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Cell</span>
          </button>
        </div>
      </div>

      {/* Grid of Key Telemetry Dials & Meters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        {/* Metric 1: Terminal Voltage */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Cell Voltage</span>
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="my-2">
            <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-cyan-400">
              {cell.voltage.toFixed(3)}
              <span className="text-xs text-slate-400 ml-1 font-normal">V</span>
            </div>
            <div className="text-[11px] font-mono mt-0.5 flex items-center gap-1">
              <span className="text-slate-500">Delta vs Mean:</span>
              <span className={deltaFromPackAvg >= 0 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                {deltaFromPackAvg >= 0 ? `+${deltaFromPackAvg.toFixed(1)}` : deltaFromPackAvg.toFixed(1)} mV
              </span>
            </div>
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            Range: {chemistrySpec.cutoffVoltage}V - {chemistrySpec.maxVoltage}V
          </div>
        </div>

        {/* Metric 2: State of Charge (SoC) */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">State of Charge</span>
            <BatteryMedium className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="my-2">
            <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-emerald-400">
              {cell.soc.toFixed(1)}
              <span className="text-xs text-slate-400 ml-1 font-normal">%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-400 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${cell.soc}%` }}
              />
            </div>
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {cell.capacityRemaining.toLocaleString()} / {cell.capacityNominal.toLocaleString()} mAh
          </div>
        </div>

        {/* Metric 3: Cell Temperature */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Cell Temperature</span>
            <Thermometer className={`w-3.5 h-3.5 ${cell.temperature > 50 ? 'text-rose-400' : 'text-amber-400'}`} />
          </div>
          <div className="my-2">
            <div className={`text-xl sm:text-2xl font-bold font-mono tracking-tight ${
              cell.temperature > 50 ? 'text-rose-400' : 'text-slate-100'
            }`}>
              {cell.temperature.toFixed(1)}
              <span className="text-xs text-slate-400 ml-1 font-normal">°C</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              {((cell.temperature * 9/5) + 32).toFixed(1)} °F
            </div>
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            Limit: {chemistrySpec.tempMax}°C (Runaway: {chemistrySpec.thermalRunawayTemp}°C)
          </div>
        </div>

        {/* Metric 4: Internal Resistance (IR) */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Internal Resistance</span>
            <Activity className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="my-2">
            <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-purple-400">
              {cell.internalResistance.toFixed(1)}
              <span className="text-xs text-slate-400 ml-1 font-normal">mΩ</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              SoH: <span className="text-emerald-400 font-bold">{cell.soh}%</span> ({cell.cycles} cycles)
            </div>
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            Typical: {chemistrySpec.typicalIR} mΩ
          </div>
        </div>

        {/* Metric 5: Remaining service life */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Battery Life</span>
            <Clock3 className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="my-2">
            <div className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-cyan-400">
              {life.remainingCycles.toLocaleString()}
              <span className="text-xs text-slate-400 ml-1 font-normal">cycles left</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-cyan-600 to-emerald-400 h-1.5 rounded-full"
                style={{ width: `${Math.max(0, Math.min(100, cell.soh))}%` }}
              />
            </div>
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            ≈ {life.estimatedServiceYears.toFixed(1)} yr @ 1 cycle/day · {life.capacityAtHealthMah.toLocaleString()} mAh healthy capacity
          </div>
        </div>
      </div>

      {/* Electrical channel data */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">Electrical channel data · CH{String(cell.id).padStart(2, '0')}</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">AFE sense lines {cell.id - 1} → {cell.id}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
          {[
            ['Terminal voltage', `${cell.voltage.toFixed(4)} V`, 'text-cyan-300'],
            ['Open-circuit V (est.)', `${ocv.toFixed(4)} V`, 'text-slate-100'],
            ['Cell current', `${cellI.toFixed(3)} A`, cellI > 0 ? 'text-cyan-300' : cellI < 0 ? 'text-amber-300' : 'text-slate-300'],
            ['Cell power', `${(cell.voltage * cellI).toFixed(2)} W`, 'text-violet-300'],
            ['Ohmic drop I·R0', `${(cellI * cell.internalResistance).toFixed(2)} mV`, 'text-slate-100'],
            ['Polarization V_RC', `${(vrc * 1000).toFixed(2)} mV`, 'text-slate-100'],
            ['I²R dissipation', `${(cellI * cellI * (cell.internalResistance / 1000)).toFixed(3)} W`, 'text-rose-300'],
            ['Balance shunt', cell.isBalancing ? `ON · ${cell.balanceBleedCurrent} mA` : 'OFF', cell.isBalancing ? 'text-amber-300' : 'text-slate-500'],
            ['Window low (UV)', `${chemistrySpec.cutoffVoltage.toFixed(2)} V`, 'text-slate-400'],
            ['Window high (OV)', `${chemistrySpec.maxVoltage.toFixed(2)} V`, 'text-slate-400'],
            ['Margin to OV', `${((chemistrySpec.maxVoltage - cell.voltage) * 1000).toFixed(0)} mV`, 'text-emerald-300'],
            ['Margin to UV', `${((cell.voltage - chemistrySpec.cutoffVoltage) * 1000).toFixed(0)} mV`, 'text-emerald-300'],
          ].map(([k, v, cls]) => (
            <div key={k} className="rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-2">
              <div className="text-[10px] text-slate-500">{k}</div>
              <div className={`tabular-nums font-bold ${cls}`}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Real-time Oscilloscope & Microscopic Reaction Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Oscilloscope Card */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white font-mono">
                Auto-Scaled Cell Oscilloscope
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-500">{cell.history.length} samples</span>
          </div>

          <LiveLineChart
            height={188}
            series={[
              {
                id: 'v',
                label: 'Voltage',
                color: '#22d3ee',
                values: voltages,
                axis: 'left',
                fill: true,
                unit: 'V',
                minSpan: 0.06,
                digits: 3,
              },
              {
                id: 'i',
                label: 'Current',
                color: '#fbbf24',
                values: currents,
                axis: 'right',
                dashed: true,
                unit: 'A',
                minSpan: 0.8,
                digits: 2,
              },
            ]}
          />

          <LiveLineChart
            height={188}
            series={[
              {
                id: 't',
                label: 'Temp',
                color: '#fb7185',
                values: temps,
                axis: 'left',
                fill: true,
                unit: 'C',
                minSpan: 2,
                digits: 1,
              },
              {
                id: 'soc',
                label: 'SoC',
                color: '#34d399',
                values: socs,
                axis: 'right',
                dashed: true,
                unit: '%',
                minSpan: 2,
                digits: 1,
              },
            ]}
          />
        </div>

        {/* Equivalent circuit model (Thevenin 1-RC) */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white font-mono">Equivalent circuit · Thevenin 1-RC</span>
            </div>
            <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
              {cellI > 0.05 ? 'CHARGE' : cellI < -0.05 ? 'DISCHARGE' : 'REST'} · {simulationMode.replace(/_/g, ' ')}
            </span>
          </div>
          <svg viewBox="0 0 420 190" className="w-full" style={{ height: 190 }}>
            <rect x="0" y="0" width="420" height="190" rx="8" fill="#050a14" />
            <line x1="40" y1="40" x2="40" y2="73" stroke="#94a3b8" strokeWidth="2" />
            <circle cx="40" cy="95" r="22" fill="none" stroke="#22d3ee" strokeWidth="2" />
            <text x="40" y="91" textAnchor="middle" fontSize="11" fill="#22d3ee" fontFamily="ui-monospace,monospace">+</text>
            <text x="40" y="107" textAnchor="middle" fontSize="11" fill="#22d3ee" fontFamily="ui-monospace,monospace">−</text>
            <line x1="40" y1="117" x2="40" y2="150" stroke="#94a3b8" strokeWidth="2" />
            <text x="70" y="92" fontSize="9" fill="#94a3b8" fontFamily="ui-monospace,monospace">OCV</text>
            <text x="70" y="104" fontSize="9" fill="#e2e8f0" fontFamily="ui-monospace,monospace">{ocv.toFixed(3)} V</text>
            <line x1="40" y1="40" x2="90" y2="40" stroke="#94a3b8" strokeWidth="2" />
            <path d="M 90 40 l 5 -7 l 10 14 l 10 -14 l 10 14 l 10 -14 l 5 7" fill="none" stroke="#f59e0b" strokeWidth="2" />
            <text x="115" y="22" textAnchor="middle" fontSize="9" fill="#fbbf24" fontFamily="ui-monospace,monospace">R0 {cell.internalResistance.toFixed(1)} mΩ</text>
            <text x="115" y="62" textAnchor="middle" fontSize="9" fill="#e2e8f0" fontFamily="ui-monospace,monospace">{(cellI * cell.internalResistance).toFixed(1)} mV</text>
            <line x1="140" y1="40" x2="190" y2="40" stroke="#94a3b8" strokeWidth="2" />
            <line x1="190" y1="20" x2="190" y2="60" stroke="#94a3b8" strokeWidth="2" />
            <line x1="290" y1="20" x2="290" y2="60" stroke="#94a3b8" strokeWidth="2" />
            <line x1="190" y1="20" x2="215" y2="20" stroke="#94a3b8" strokeWidth="2" />
            <path d="M 215 20 l 4 -6 l 8 12 l 8 -12 l 8 12 l 8 -12 l 4 6" fill="none" stroke="#a78bfa" strokeWidth="2" />
            <line x1="255" y1="20" x2="290" y2="20" stroke="#94a3b8" strokeWidth="2" />
            <line x1="190" y1="60" x2="234" y2="60" stroke="#94a3b8" strokeWidth="2" />
            <line x1="234" y1="50" x2="234" y2="70" stroke="#a78bfa" strokeWidth="2.5" />
            <line x1="244" y1="50" x2="244" y2="70" stroke="#a78bfa" strokeWidth="2.5" />
            <line x1="244" y1="60" x2="290" y2="60" stroke="#94a3b8" strokeWidth="2" />
            <text x="240" y="88" textAnchor="middle" fontSize="9" fill="#c4b5fd" fontFamily="ui-monospace,monospace">R1 {(cell.internalResistance * 0.7).toFixed(1)} mΩ ‖ C1</text>
            <text x="240" y="100" textAnchor="middle" fontSize="9" fill="#e2e8f0" fontFamily="ui-monospace,monospace">V_RC {(vrc * 1000).toFixed(1)} mV</text>
            <line x1="290" y1="40" x2="370" y2="40" stroke="#94a3b8" strokeWidth="2" />
            <line x1="40" y1="150" x2="370" y2="150" stroke="#94a3b8" strokeWidth="2" />
            <circle cx="370" cy="40" r="5" fill="#f87171" />
            <circle cx="370" cy="150" r="5" fill="#60a5fa" />
            <line x1="370" y1="48" x2="370" y2="142" stroke="#334155" strokeWidth="1" strokeDasharray="3 3" />
            <text x="380" y="92" fontSize="9" fill="#94a3b8" fontFamily="ui-monospace,monospace">V_t</text>
            <text x="380" y="106" fontSize="11" fontWeight={700} fill="#22d3ee" fontFamily="ui-monospace,monospace">{cell.voltage.toFixed(3)}</text>
            {Math.abs(cellI) > 0.05 && (
              <path d="M 300 40 L 360 40" stroke="#ecfeff" strokeWidth="2" strokeDasharray="4 8" className={cellI < 0 ? 'sld-flow' : 'sld-flow-rev'} />
            )}
            <text x="210" y="174" textAnchor="middle" fontSize="9.5" fill="#94a3b8" fontFamily="ui-monospace,monospace">
              V_t = OCV + I·R0 + V_RC = {ocv.toFixed(3)} {cellI >= 0 ? '+' : '−'} {Math.abs((cellI * cell.internalResistance) / 1000).toFixed(3)} {vrc >= 0 ? '+' : '−'} {Math.abs(vrc).toFixed(3)} V
            </text>
          </svg>
        </div>
      </div>

      {/* Cell Control & Stress Workbench */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-white font-mono">
              Cell Diagnostics & Fault Injection Workbench
            </h4>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Test how the Battery Management System handles real-world cell anomalies
          </span>
        </div>

        {/* 1. Fine Voltage Trimmer Slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-slate-300">Manual Voltage Trimmer:</span>
            <span className="text-cyan-400 font-bold">{cell.voltage.toFixed(3)} V</span>
          </div>
          <input
            type="range"
            min={chemistrySpec.cutoffVoltage - 0.2}
            max={chemistrySpec.maxVoltage + 0.2}
            step={0.01}
            value={cell.voltage}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              onUpdateCellVoltage(cell.id, val);
            }}
            className="w-full accent-cyan-400 bg-slate-800 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>Cutoff: {chemistrySpec.cutoffVoltage}V</span>
            <span>Nominal: {chemistrySpec.nominalVoltage}V</span>
            <span>Max: {chemistrySpec.maxVoltage}V</span>
          </div>
        </div>

        {/* 2. Fault Injection Action Buttons */}
        <div>
          <span className="text-[11px] font-mono text-slate-400 block mb-2">
            Inject Specific Anomaly / Stress Fault into Cell #{cell.id}:
          </span>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {/* Fault 1: Over Voltage */}
            <button
              onClick={() => {
                playAlarmSound('fault');
                onInjectCellFault(cell.id, 'over_voltage');
              }}
              className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-mono transition text-left cursor-pointer"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400 mb-1" />
              <span className="font-bold block">Over-Voltage</span>
              <span className="text-[9px] text-rose-400/80">Force {chemistrySpec.maxVoltage + 0.15}V</span>
            </button>

            {/* Fault 2: Under Voltage */}
            <button
              onClick={() => {
                playAlarmSound('warning');
                onInjectCellFault(cell.id, 'under_voltage');
              }}
              className="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-mono transition text-left cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 mb-1" />
              <span className="font-bold block">Under-Voltage</span>
              <span className="text-[9px] text-amber-400/80">Force {chemistrySpec.cutoffVoltage - 0.2}V</span>
            </button>

            {/* Fault 3: Thermal Hotspot */}
            <button
              onClick={() => {
                playAlarmSound('warning');
                onInjectCellFault(cell.id, 'high_temp');
              }}
              className="p-2 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[11px] font-mono transition text-left cursor-pointer"
            >
              <Flame className="w-3.5 h-3.5 text-orange-400 mb-1" />
              <span className="font-bold block">Thermal Spike</span>
              <span className="text-[9px] text-orange-400/80">Heat to 68°C</span>
            </button>

            {/* Fault 4: High IR */}
            <button
              onClick={() => {
                playAlarmSound('warning');
                onInjectCellFault(cell.id, 'high_ir');
              }}
              className="p-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-mono transition text-left cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-purple-400 mb-1" />
              <span className="font-bold block">Aged / High IR</span>
              <span className="text-[9px] text-purple-400/80">3x Resistance</span>
            </button>

            {/* Fault 5: Dendrite Short */}
            <button
              onClick={() => {
                playAlarmSound('fault');
                onInjectCellFault(cell.id, 'dendrite_micro_short');
              }}
              className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-[11px] font-mono transition text-left cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5 text-red-400 mb-1" />
              <span className="font-bold block">Micro-Short</span>
              <span className="text-[9px] text-red-400/80">Internal Dendrite</span>
            </button>

            {/* Fault 6: Thermal Runaway */}
            <button
              onClick={() => {
                playAlarmSound('fault');
                onInjectCellFault(cell.id, 'thermal_runaway');
              }}
              className="p-2 rounded-lg bg-rose-950/60 hover:bg-rose-900/60 text-rose-200 border border-rose-600/50 text-[11px] font-mono transition text-left cursor-pointer animate-pulse"
            >
              <Flame className="w-3.5 h-3.5 text-rose-500 mb-1" />
              <span className="font-bold block">Runaway</span>
              <span className="text-[9px] text-rose-400">Extreme Heat</span>
            </button>
          </div>
        </div>

        {/* 3. Individual Balancing Shunt Override */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <div>
              <span className="text-xs font-semibold text-slate-200 block">
                Force Individual Balancing Bleed Override
              </span>
              <span className="text-[10px] text-slate-400">
                Manually engage passive shunt bleeding MOSFET (-150 mA) on this cell
              </span>
            </div>
          </div>

          <button
            onClick={() => {
              playCellClickSound(700);
              onToggleCellBalance(cell.id);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition cursor-pointer border ${
              cell.isBalancing
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {cell.isBalancing ? 'BALANCING [ON]' : 'BALANCING [OFF]'}
          </button>
        </div>
      </div>
    </div>
  );
};
