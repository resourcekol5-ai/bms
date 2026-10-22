import React, { useEffect, useState } from 'react';
import { CellData, ChemistrySpec, ViewMode, SimulationMode } from '../types/battery';
import { 
  Cpu, 
  Thermometer, 
  BarChart3, 
  Flame, 
  Zap, 
  ArrowUpRight, 
  ArrowDownRight,
  Box,
  Activity,
  BatteryMedium,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Clock3
} from 'lucide-react';
import { playCellClickSound, playAlarmSound } from '../utils/audio';
import { DeltaBarChart } from './charts/DeltaBarChart';
import { LiveLineChart } from './charts/LiveLineChart';
import { ThreeStack3D, HeatmapColorMode } from './ThreeStack3D';
import { estimateCellLife } from '../utils/batteryLife';

interface StackVisualizerProps {
  cells: CellData[];
  selectedCellId: number;
  onSelectCell: (id: number) => void;
  chemistrySpec: ChemistrySpec;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  simulationMode: SimulationMode;
  packVoltage: number;
  packCurrent: number;
  deltaVoltageMv: number;
  seriesCount: number;
  parallelCount: number;
  onUpdateSeriesCount: (count: number) => void;
  onUpdateParallelCount: (count: number) => void;
  onUpdateCellVoltage?: (cellId: number, newVoltage: number) => void;
  onInjectCellFault?: (cellId: number, fault: CellData['faultType']) => void;
  onToggleCellBalance?: (cellId: number) => void;
  onHealCell?: (cellId: number) => void;
}

export const StackVisualizer: React.FC<StackVisualizerProps> = ({
  cells,
  selectedCellId,
  onSelectCell,
  chemistrySpec,
  viewMode,
  onChangeViewMode,
  simulationMode,
  packVoltage,
  packCurrent,
  deltaVoltageMv,
  seriesCount,
  parallelCount,
  onUpdateSeriesCount,
  onUpdateParallelCount,
  onUpdateCellVoltage,
  onInjectCellFault,
  onToggleCellBalance,
  onHealCell,
}) => {
  const [heatmapMode, setHeatmapMode] = useState<HeatmapColorMode>('thermal');
  const [sInput, setSInput] = useState<string>(String(seriesCount));
  const [pInput, setPInput] = useState<string>(String(parallelCount));

  useEffect(() => setSInput(String(seriesCount)), [seriesCount]);
  useEffect(() => setPInput(String(parallelCount)), [parallelCount]);

  const selectedCell = cells.find((c) => c.id === selectedCellId) || cells[0];

  // Highest and lowest cells
  const maxVoltageCell = cells.reduce((prev, curr) => (curr.voltage > prev.voltage ? curr : prev), cells[0]);
  const minVoltageCell = cells.reduce((prev, curr) => (curr.voltage < prev.voltage ? curr : prev), cells[0]);
  const maxTempCell = cells.reduce((prev, curr) => (curr.temperature > prev.temperature ? curr : prev), cells[0]);

  // Topology Presets
  const topologyPresets = [
    { label: '4S1P (12V)', s: 4, p: 1 },
    { label: '6S1P (22.2V Drone)', s: 6, p: 1 },
    { label: '8S1P (32V)', s: 8, p: 1 },
    { label: '10S2P (36V E-Bike)', s: 10, p: 2 },
    { label: '12S2P (48V Telecom)', s: 12, p: 2 },
    { label: '14S4P (52V Powerwall)', s: 14, p: 4 },
    { label: '16S2P (60V EV)', s: 16, p: 2 },
  ];

  const handleApplyS = (val: number) => {
    const clamped = Math.max(1, Math.min(32, val));
    setSInput(String(clamped));
    onUpdateSeriesCount(clamped);
  };

  const handleApplyP = (val: number) => {
    const clamped = Math.max(1, Math.min(12, val));
    setPInput(String(clamped));
    onUpdateParallelCount(clamped);
  };

  const deltaFromPackAvg = ((selectedCell.voltage - (packVoltage / Math.max(1, seriesCount))) * 1000);
  const selectedLife = estimateCellLife(selectedCell, chemistrySpec);

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-2xl backdrop-blur-md space-y-5">
      {/* 1. Header & Direct Stack Creation Input Bar */}
      <div className="pb-4 border-b border-slate-800/80 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Box className="w-4 h-4" />
              </span>
              <h2 className="text-lg font-bold text-white tracking-wide">
                3D Multi-Cell Stack Architect & Dynamic Health Monitor
              </h2>
              <span className="px-2 py-0.5 text-xs font-mono font-semibold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                {seriesCount}S{parallelCount > 1 ? `${parallelCount}P` : '1P'} ({cells.length} Total Cells)
              </span>
              <span className={`px-2 py-0.5 text-xs font-mono rounded border ${chemistrySpec.badgeBg}`}>
                {chemistrySpec.name} ({chemistrySpec.formFactorName.split('(')[0].trim()})
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Configure Series (S) and Parallel (P) string topology below. Click any cell in the 3D realistic array to monitor its individual health, voltage sag, and thermal dissipation in real time.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-400">Pack Output:</span>
            <span className="font-bold text-white bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-sm">
              {packVoltage.toFixed(2)} V
            </span>
            <span className={`font-bold px-2.5 py-1 rounded-lg border text-sm ${
              packCurrent > 0 ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' : packCurrent < 0 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}>
              {packCurrent > 0 ? `+${packCurrent.toFixed(1)} A` : `${packCurrent.toFixed(1)} A`}
            </span>
          </div>
        </div>

        {/* Stack Creation Inputs for S and P */}
        <div className="bg-[#070d1a] border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              Stack Creation Inputs:
            </span>

            {/* Input S (Series) */}
            <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-700">
              <span className="text-xs font-mono text-cyan-400 font-bold">Series (S):</span>
              <button
                onClick={() => handleApplyS(seriesCount - 1)}
                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={32}
                value={sInput}
                onChange={(e) => {
                  setSInput(e.target.value);
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= 32) {
                    onUpdateSeriesCount(val);
                  }
                }}
                className="w-12 bg-slate-950 text-white font-mono font-bold text-xs text-center border border-slate-700 rounded px-1 py-0.5"
              />
              <button
                onClick={() => handleApplyS(seriesCount + 1)}
                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer"
              >
                +
              </button>
            </div>

            {/* Input P (Parallel) */}
            <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-700">
              <span className="text-xs font-mono text-indigo-400 font-bold">Parallel (P):</span>
              <button
                onClick={() => handleApplyP(parallelCount - 1)}
                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer"
              >
                -
              </button>
              <input
                type="number"
                min={1}
                max={12}
                value={pInput}
                onChange={(e) => {
                  setPInput(e.target.value);
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 1 && val <= 12) {
                    onUpdateParallelCount(val);
                  }
                }}
                className="w-12 bg-slate-950 text-white font-mono font-bold text-xs text-center border border-slate-700 rounded px-1 py-0.5"
              />
              <button
                onClick={() => handleApplyP(parallelCount + 1)}
                className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          {/* Quick Topology Presets */}
          <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono">
            <span className="text-slate-500 hidden sm:inline">Presets:</span>
            {topologyPresets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => {
                  playCellClickSound(600);
                  handleApplyS(preset.s);
                  handleApplyP(preset.p);
                }}
                className={`px-2 py-1 rounded-lg border transition cursor-pointer whitespace-nowrap ${
                  seriesCount === preset.s && parallelCount === preset.p
                    ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow'
                    : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* View Mode Switcher & Target Cell Jump Bar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                playCellClickSound(650);
                onChangeViewMode('physical');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'physical'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>3D Realistic Stack</span>
            </button>

            <button
              onClick={() => {
                playCellClickSound(650);
                onChangeViewMode('schematic');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'schematic'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>BMS Schematic</span>
            </button>

            <button
              onClick={() => {
                playCellClickSound(650);
                onChangeViewMode('thermal');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'thermal'
                  ? 'bg-rose-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Thermometer className="w-3.5 h-3.5" />
              <span>Thermal IR Map</span>
            </button>

            <button
              onClick={() => {
                playCellClickSound(650);
                onChangeViewMode('delta');
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'delta'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Voltage Delta (ΔV)</span>
            </button>
          </div>

          {/* Quick Target Cell Jump Buttons */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <button
              onClick={() => {
                playCellClickSound(700);
                onSelectCell(maxVoltageCell.id);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition cursor-pointer text-[11px]"
            >
              <ArrowUpRight className="w-3 h-3" />
              <span>Highest: C#{maxVoltageCell.id} ({maxVoltageCell.voltage.toFixed(3)}V)</span>
            </button>

            <button
              onClick={() => {
                playCellClickSound(500);
                onSelectCell(minVoltageCell.id);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition cursor-pointer text-[11px]"
            >
              <ArrowDownRight className="w-3 h-3" />
              <span>Lowest: C#{minVoltageCell.id} ({minVoltageCell.voltage.toFixed(3)}V)</span>
            </button>

            <button
              onClick={() => {
                playCellClickSound(800);
                onSelectCell(maxTempCell.id);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 transition cursor-pointer text-[11px]"
            >
              <Flame className="w-3 h-3 text-rose-400" />
              <span>Peak: C#{maxTempCell.id} ({maxTempCell.temperature.toFixed(1)}°C)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Main Visual Viewport: REALISTIC 3D STACK */}
      {viewMode === 'physical' && (
        <div className="space-y-4">
          <ThreeStack3D
            cells={cells}
            selectedCellId={selectedCellId}
            onSelectCell={onSelectCell}
            chemistrySpec={chemistrySpec}
            seriesCount={seriesCount}
            parallelCount={parallelCount}
            isRunning={simulationMode !== 'idle'}
            colorMode={heatmapMode}
            onChangeColorMode={setHeatmapMode}
          />
        </div>
      )}

      {/* View Mode 2: BMS SCHEMATIC VIEW */}
      {viewMode === 'schematic' && (
        <div className="w-full bg-[#070d1a] border border-slate-800 rounded-2xl p-4 md:p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-bold text-white font-mono">
                BMS Analog Front-End (AFE) Sense & Active Balancing Ladder
              </span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-mono">
              {seriesCount}S Channel Matrix
            </span>
          </div>

          <div className="space-y-2">
            {cells.map((cell) => {
              const isSelected = cell.id === selectedCellId;
              return (
                <div
                  key={cell.id}
                  onClick={() => {
                    playCellClickSound(500 + cell.id * 20);
                    onSelectCell(cell.id);
                  }}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/30'
                      : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${
                      isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'
                    }`}>
                      CH#{String(cell.id).padStart(2, '0')}
                    </span>
                    <span className="text-xs font-mono font-bold text-white">
                      {cell.voltage.toFixed(3)} V
                    </span>
                  </div>

                  <div className="flex items-center gap-3 font-mono text-xs">
                    {cell.isBalancing ? (
                      <span className="text-amber-400 flex items-center gap-1 font-bold animate-pulse">
                        <Zap className="w-3.5 h-3.5" /> SHUNT ACTIVE (-{cell.balanceBleedCurrent}mA)
                      </span>
                    ) : (
                      <span className="text-slate-500">SHUNT IDLE</span>
                    )}
                    <span className="text-slate-400">IR: {cell.internalResistance.toFixed(1)} mΩ</span>
                    <span className="text-emerald-400 font-bold">{cell.soc.toFixed(1)}% SoC</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* View Mode 3: THERMAL 2D IR MAP */}
      {viewMode === 'thermal' && (
        <div className="w-full bg-[#070d1a] border border-slate-800 rounded-2xl p-4 md:p-6 shadow-2xl">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-bold text-white font-mono">
                Thermal Infrared Surface Heatmap
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400">
              <span>Cool (20°C)</span>
              <div className="w-28 h-2.5 rounded-full bg-gradient-to-r from-cyan-400 via-lime-400 via-yellow-400 via-orange-500 to-red-600" />
              <span>Hot (80°C+)</span>
            </div>
          </div>

          <div 
            className="grid gap-2.5"
            style={{
              gridTemplateColumns: `repeat(${Math.min(cells.length, seriesCount <= 4 ? seriesCount : 6)}, minmax(110px, 1fr))`
            }}
          >
            {cells.map((cell) => {
              const isSelected = cell.id === selectedCellId;
              const isHotspot = cell.id === maxTempCell.id && maxTempCell.temperature > 35;

              return (
                <div
                  key={cell.id}
                  onClick={() => {
                    playCellClickSound(500 + cell.id * 20);
                    onSelectCell(cell.id);
                  }}
                  className={`p-3 rounded-xl border transition-all cursor-pointer bg-slate-950 flex flex-col justify-between ${
                    isSelected ? 'border-cyan-400 ring-2 ring-cyan-500/40 bg-cyan-950/20' : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-bold text-slate-300">C#{cell.id}</span>
                    {isHotspot && (
                      <span className="text-[9px] font-bold px-1 rounded bg-red-600 text-white animate-pulse">HOT</span>
                    )}
                  </div>
                  <div className="text-xl font-bold font-mono text-white my-1">
                    {cell.temperature.toFixed(1)}°C
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    {cell.voltage.toFixed(3)}V · {cell.soc.toFixed(0)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* View Mode 4: VOLTAGE DELTA (ΔV) */}
      {viewMode === 'delta' && (
        <div className="w-full bg-[#070d1a] border border-slate-800 rounded-2xl p-4 md:p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-sm font-bold text-white font-mono flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              Cell-to-Cell Voltage Delta (ΔV = {deltaVoltageMv.toFixed(1)} mV)
            </span>
            <span className="text-xs font-mono text-slate-400">
              Pack Mean: {(packVoltage / Math.max(1, seriesCount)).toFixed(3)} V
            </span>
          </div>
          <DeltaBarChart
            cells={cells}
            meanVoltage={cells.reduce((s, c) => s + c.voltage, 0) / Math.max(1, cells.length)}
            selectedId={selectedCellId}
            onSelect={(id) => {
              playCellClickSound(500 + id * 20);
              onSelectCell(id);
            }}
          />
        </div>
      )}

      {/* 3. DYNAMIC INDIVIDUAL CELL HEALTH & DIAGNOSTICS INSPECTOR */}
      {selectedCell && (
        <div className="bg-[#070d1a] border border-cyan-500/40 rounded-2xl p-4 md:p-5 shadow-2xl space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <BatteryMedium className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white tracking-wide">
                    Live Health & Diagnostics: {selectedCell.label}
                  </h3>
                  <span className="text-xs px-2 py-0.5 rounded-full font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    ACTIVE SELECTION
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Comprehensive State of Health (SoH %), degradation analytics, internal resistance, and dynamic telemetry.
                </p>
              </div>
            </div>

            {/* Health Status Grade Badge */}
            <div className="flex items-center gap-2">
              <div className={`px-3 py-1 rounded-xl text-xs font-mono font-bold border flex items-center gap-1.5 ${
                selectedCell.faultType !== 'none'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                  : selectedCell.soh >= 95
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : selectedCell.soh >= 85
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-orange-500/20 text-orange-300 border-orange-500/40'
              }`}>
                {selectedCell.faultType !== 'none' ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                    <span>FAULT: {selectedCell.faultType.replace('_', ' ').toUpperCase()}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>HEALTH GRADE: {selectedCell.soh >= 95 ? 'A+ (PRISTINE)' : selectedCell.soh >= 90 ? 'A (OPTIMAL)' : 'B (AGED)'}</span>
                  </>
                )}
              </div>

              {onHealCell && (
                <button
                  onClick={() => {
                    playCellClickSound(900);
                    onHealCell(selectedCell.id);
                  }}
                  title="Restore this cell to healthy baseline"
                  className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition border border-slate-700 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Cell</span>
                </button>
              )}
            </div>
          </div>

          {/* Key Health Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 text-xs font-mono">
            {/* Metric 1: State of Health (SoH %) */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span>State of Health (SoH)</span>
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold text-emerald-400">
                {selectedCell.soh}%
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Cycles: {selectedCell.cycles} · Capacity Fade: {(100 - selectedCell.soh).toFixed(1)}%
              </div>
            </div>

            {/* Metric 2: Terminal Voltage */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span>Cell Voltage</span>
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="text-2xl font-bold text-cyan-400">
                {selectedCell.voltage.toFixed(3)} V
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Δvs Mean: <span className={deltaFromPackAvg >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
                  {deltaFromPackAvg >= 0 ? `+${deltaFromPackAvg.toFixed(1)}` : deltaFromPackAvg.toFixed(1)} mV
                </span>
              </div>
            </div>

            {/* Metric 3: Cell Temperature */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span>Temperature</span>
                <Thermometer className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className={`text-2xl font-bold ${selectedCell.temperature > 50 ? 'text-rose-400' : 'text-slate-100'}`}>
                {selectedCell.temperature.toFixed(1)} °C
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Limit: {chemistrySpec.tempMax}°C ({((selectedCell.temperature * 9/5) + 32).toFixed(1)}°F)
              </div>
            </div>

            {/* Metric 4: Internal Resistance (DCIR) */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span>Internal Resistance</span>
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="text-2xl font-bold text-purple-400">
                {selectedCell.internalResistance.toFixed(1)} mΩ
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Factory: {chemistrySpec.typicalIR} mΩ · Degradation: +{Math.max(0, selectedCell.internalResistance - chemistrySpec.typicalIR).toFixed(1)}mΩ
              </div>
            </div>

            {/* Metric 5: Battery life */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span>Battery Life</span>
                <Clock3 className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="text-2xl font-bold text-cyan-400">
                {selectedLife.remainingCycles.toLocaleString()}
                <span className="text-[10px] text-slate-500 font-normal ml-1">cycles left</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                ≈ {selectedLife.estimatedServiceYears.toFixed(1)} yr @ daily cycle · {selectedLife.capacityAtHealthMah.toLocaleString()} mAh
              </div>
            </div>
          </div>

          {/* Real-time Oscilloscope for selected cell */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between mb-2 text-xs font-mono">
              <span className="font-bold text-slate-200">
                Live Waveform Oscilloscope (Cell #{selectedCell.id})
              </span>
              <span className="text-[10px] text-slate-500">
                {selectedCell.history.length} samples · Auto-scaled
              </span>
            </div>
            <LiveLineChart
              height={140}
              compact
              series={[
                {
                  id: 'sv',
                  label: 'Voltage',
                  color: '#22d3ee',
                  values: selectedCell.history.map((h) => h.voltage),
                  fill: true,
                  unit: 'V',
                  minSpan: 0.05,
                  digits: 3,
                },
                {
                  id: 'st',
                  label: 'Temp',
                  color: '#fb7185',
                  values: selectedCell.history.map((h) => h.temperature),
                  axis: 'right',
                  dashed: true,
                  unit: '°C',
                  minSpan: 2,
                  digits: 1,
                },
              ]}
            />
          </div>

          {/* Manual Voltage Trimmer & Balance Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs font-mono">
            {onUpdateCellVoltage && (
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Manual Voltage Trimmer:</span>
                  <span className="text-cyan-400 font-bold">{selectedCell.voltage.toFixed(3)} V</span>
                </div>
                <input
                  type="range"
                  min={chemistrySpec.cutoffVoltage - 0.2}
                  max={chemistrySpec.maxVoltage + 0.2}
                  step={0.01}
                  value={selectedCell.voltage}
                  onChange={(e) => onUpdateCellVoltage(selectedCell.id, parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 bg-slate-800 rounded cursor-pointer"
                />
              </div>
            )}

            {onToggleCellBalance && (
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-slate-200 font-bold block">AFE Shunt Bleed Override</span>
                  <span className="text-[10px] text-slate-500">Bleed -150mA for cell #{selectedCell.id}</span>
                </div>
                <button
                  onClick={() => onToggleCellBalance(selectedCell.id)}
                  className={`px-3 py-1 rounded-lg font-bold transition cursor-pointer border ${
                    selectedCell.isBalancing
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                >
                  {selectedCell.isBalancing ? 'BLEED ON' : 'BLEED OFF'}
                </button>
              </div>
            )}
          </div>

          {/* Fault Injector & Diagnostics Controls */}
          {onInjectCellFault && (
            <div className="pt-2 border-t border-slate-800">
              <span className="text-xs font-bold text-slate-400 block mb-2 font-mono">
                Inject Diagnostics Stress Test on Cell #{selectedCell.id}:
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                <button
                  onClick={() => {
                    playAlarmSound('fault');
                    onInjectCellFault(selectedCell.id, 'over_voltage');
                  }}
                  className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[11px] font-mono transition text-left cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400 mb-1" />
                  <span className="font-bold block">Over-Voltage</span>
                  <span className="text-[9px] text-rose-400/80">Force {chemistrySpec.maxVoltage + 0.15}V</span>
                </button>

                <button
                  onClick={() => {
                    playAlarmSound('warning');
                    onInjectCellFault(selectedCell.id, 'under_voltage');
                  }}
                  className="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-mono transition text-left cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400 mb-1" />
                  <span className="font-bold block">Under-Voltage</span>
                  <span className="text-[9px] text-amber-400/80">Force {chemistrySpec.cutoffVoltage - 0.2}V</span>
                </button>

                <button
                  onClick={() => {
                    playAlarmSound('warning');
                    onInjectCellFault(selectedCell.id, 'high_temp');
                  }}
                  className="p-2 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-300 border border-orange-500/30 text-[11px] font-mono transition text-left cursor-pointer"
                >
                  <Flame className="w-3.5 h-3.5 text-orange-400 mb-1" />
                  <span className="font-bold block">Thermal Spike</span>
                  <span className="text-[9px] text-orange-400/80">Heat to 68°C</span>
                </button>

                <button
                  onClick={() => {
                    playAlarmSound('warning');
                    onInjectCellFault(selectedCell.id, 'high_ir');
                  }}
                  className="p-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[11px] font-mono transition text-left cursor-pointer"
                >
                  <Activity className="w-3.5 h-3.5 text-purple-400 mb-1" />
                  <span className="font-bold block">Aged / High IR</span>
                  <span className="text-[9px] text-purple-400/80">3x Resistance</span>
                </button>

                <button
                  onClick={() => {
                    playAlarmSound('fault');
                    onInjectCellFault(selectedCell.id, 'dendrite_micro_short');
                  }}
                  className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-[11px] font-mono transition text-left cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-red-400 mb-1" />
                  <span className="font-bold block">Micro-Short</span>
                  <span className="text-[9px] text-red-400/80">Internal Dendrite</span>
                </button>

                <button
                  onClick={() => {
                    playAlarmSound('fault');
                    onInjectCellFault(selectedCell.id, 'thermal_runaway');
                  }}
                  className="p-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-600/60 text-[11px] font-mono transition text-left cursor-pointer animate-pulse"
                >
                  <Flame className="w-3.5 h-3.5 text-rose-500 mb-1" />
                  <span className="font-bold block">Runaway</span>
                  <span className="text-[9px] text-rose-400">Extreme Heat</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
