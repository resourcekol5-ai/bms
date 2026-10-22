import type { ReactNode } from 'react';
import {
  BatteryChemistryType,
  CellData,
  ChemistrySpec,
  LoadProfile,
  PackConfig,
  SimulationMode,
  ViewMode,
} from '../../types/battery';
import { BATTERY_CHEMISTRIES, LOAD_PROFILES } from '../../data/batteryChemistryData';
import { playCellClickSound } from '../../utils/audio';
import { formatClock } from '../../utils/reportGenerator';
import {
  Play,
  Square,
  LayoutDashboard,
  Layers,
  Activity,
  BatteryMedium,
  Sliders,
  Fan,
  Sparkles,
  Shuffle,
  RotateCcw,
  FileText,
  FileSpreadsheet,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Home,
} from 'lucide-react';

export type DashTab = 'overview' | 'stack' | 'waveforms' | 'cell' | 'operate';

interface DashboardSidebarProps {
  dashTab: DashTab;
  onChangeTab: (tab: DashTab) => void;
  chemistry: BatteryChemistryType;
  chemistrySpec: ChemistrySpec;
  onSelectChemistry: (c: BatteryChemistryType) => void;
  seriesCount: number;
  parallelCount: number;
  onUpdateSeriesCount: (n: number) => void;
  onUpdateParallelCount: (n: number) => void;
  simulationMode: SimulationMode;
  onChangeMode: (m: SimulationMode) => void;
  loadProfile: LoadProfile;
  onChangeLoadProfile: (p: LoadProfile) => void;
  config: PackConfig;
  onUpdateConfig: (partial: Partial<PackConfig>) => void;
  viewMode: ViewMode;
  onChangeViewMode: (m: ViewMode) => void;
  cells: CellData[];
  selectedCellId: number;
  onSelectCell: (id: number) => void;
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
  onViewReport: () => void;
  onDownloadCsv: () => void;
  onDownloadPdf: () => void;
  elapsedMs: number;
  tickCount: number;
  isAutoBalancing: boolean;
  onAutoBalance: () => void;
  onRandomizeImbalance: () => void;
  onResetPack: () => void;
  onOpenReports: () => void;
  onOpenWizard: () => void;
}

const inputClass =
  'w-full bg-[#0b1220] border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-100 font-mono outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/30 cursor-pointer';

const numClass =
  'w-[4.5rem] shrink-0 bg-[#0b1220] border border-slate-700 rounded-md px-2 py-1.5 text-xs text-right text-cyan-300 font-mono outline-none focus:border-cyan-400';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-3 py-3 border-b border-slate-800">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-500/80 mb-2.5">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[92px] shrink-0 text-[11px] text-slate-400 leading-tight">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

export function DashboardSidebar(props: DashboardSidebarProps) {
  const {
    dashTab,
    onChangeTab,
    chemistry,
    chemistrySpec,
    onSelectChemistry,
    seriesCount,
    parallelCount,
    onUpdateSeriesCount,
    onUpdateParallelCount,
    simulationMode,
    onChangeMode,
    loadProfile,
    onChangeLoadProfile,
    config,
    onUpdateConfig,
    viewMode,
    onChangeViewMode,
    cells,
    selectedCellId,
    onSelectCell,
  isRunning,
  onRun,
  onStop,
  onViewReport,
  onDownloadCsv,
  onDownloadPdf,
  elapsedMs,
    tickCount,
    isAutoBalancing,
    onAutoBalance,
    onRandomizeImbalance,
    onResetPack,
    onOpenReports,
    onOpenWizard,
  } = props;

  const chemistries = Object.values(BATTERY_CHEMISTRIES);
  const selected = cells.find((c) => c.id === selectedCellId) || cells[0];
  const selIdx = Math.max(0, cells.findIndex((c) => c.id === selectedCellId));

  const views: { id: DashTab; label: string; icon: ReactNode }[] = [
    { id: 'overview', label: 'Electrical overview (SLD)', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
    { id: 'stack', label: 'Cell string', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'waveforms', label: 'Trends / scope', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'cell', label: 'Cell channel', icon: <BatteryMedium className="w-3.5 h-3.5" /> },
    { id: 'operate', label: 'Control', icon: <Sliders className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col min-h-full bg-[#080d18]">
      <div className="px-3 py-3 border-b border-slate-800 bg-[#0c1424]">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-bold">Control panel</div>
            <div className="text-sm font-bold text-white">Electrical settings</div>
          </div>
          <button
            onClick={onOpenWizard}
            title="Home / Starting Cell Setup Page"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-bold border border-slate-700 cursor-pointer shadow"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Home</span>
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] font-mono">
          <span className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            <span className={isRunning ? 'text-emerald-400' : 'text-slate-400'}>{isRunning ? 'RUNNING' : 'STOPPED'}</span>
          </span>
          <span className="text-slate-500">{formatClock(elapsedMs)} · {tickCount} t</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 mt-2.5">
          <button
            onClick={onRun}
            disabled={isRunning}
            className={`h-9 rounded-md text-xs font-bold flex items-center justify-center gap-1 cursor-pointer ${
              isRunning ? 'bg-emerald-950 text-emerald-700 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" /> Run
          </button>
          <button
            onClick={onStop}
            disabled={!isRunning}
            className={`h-9 rounded-md text-xs font-bold flex items-center justify-center gap-1 cursor-pointer ${
              !isRunning ? 'bg-rose-950 text-rose-800 cursor-not-allowed' : 'bg-rose-600 text-white hover:bg-rose-500'
            }`}
          >
            <Square className="w-3 h-3 fill-current" /> Stop
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          <button
            onClick={onViewReport}
            className="h-9 rounded-md text-xs font-bold bg-cyan-700 text-white flex items-center justify-center gap-1 cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" /> View
          </button>
          <button
            onClick={onDownloadCsv}
            className="h-9 rounded-md text-xs font-bold bg-emerald-700 text-white flex items-center justify-center gap-1 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={onDownloadPdf}
            className="h-9 rounded-md text-xs font-bold bg-rose-700 text-white flex items-center justify-center gap-1 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      <Group title="Display">
        <Row label="View">
          <select className={inputClass} value={dashTab} onChange={(e) => onChangeTab(e.target.value as DashTab)}>
            {views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Row>
        <div className="grid grid-cols-5 gap-1">
          {views.map((v) => (
            <button
              key={v.id}
              title={v.label}
              onClick={() => onChangeTab(v.id)}
              className={`h-8 rounded-md flex items-center justify-center cursor-pointer border ${
                dashTab === v.id
                  ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                  : 'bg-[#0b1220] text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              {v.icon}
            </button>
          ))}
        </div>
        {dashTab === 'stack' && (
          <Row label="Stack mode">
            <select className={inputClass} value={viewMode} onChange={(e) => onChangeViewMode(e.target.value as ViewMode)}>
              <option value="physical">Pack assembly</option>
              <option value="schematic">BMS schematic</option>
              <option value="thermal">Thermal IR</option>
              <option value="delta">Voltage delta</option>
            </select>
          </Row>
        )}
      </Group>

      <Group title="Pack">
        <Row label="Cell type">
          <div className="flex items-center gap-1">
            <select
              className={inputClass}
              value={chemistry}
              onChange={(e) => onSelectChemistry(e.target.value as BatteryChemistryType)}
            >
              {chemistries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.nominalVoltage.toFixed(2)} V
                </option>
              ))}
            </select>
            <button
              onClick={onOpenWizard}
              title="Open the cell type selector"
              className="h-8 w-8 shrink-0 rounded-md bg-[#0b1220] border border-slate-700 text-slate-300 hover:text-cyan-300 cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 mx-auto" />
            </button>
          </div>
        </Row>
        <Row label="Cell rating">
          <div className="text-[11px] text-slate-300 font-mono truncate">
            {chemistrySpec.cutoffVoltage.toFixed(2)}–{chemistrySpec.maxVoltage.toFixed(2)} V · {(chemistrySpec.typicalCapacity / 1000).toFixed(1)} Ah · {chemistrySpec.typicalIR} mΩ
          </div>
        </Row>
        <Row label="Series (S)">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onUpdateSeriesCount(Math.max(1, seriesCount - 1))}
              className="h-8 w-7 rounded-md bg-[#0b1220] border border-slate-700 text-slate-300 font-bold text-xs hover:text-white cursor-pointer"
            >
              -
            </button>
            <input
              type="number"
              min={1}
              max={32}
              value={seriesCount}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= 32) onUpdateSeriesCount(val);
              }}
              className="flex-1 min-w-0 bg-[#0b1220] border border-slate-700 rounded-md h-8 text-center text-xs font-mono font-bold text-cyan-300"
            />
            <button
              onClick={() => onUpdateSeriesCount(Math.min(32, seriesCount + 1))}
              className="h-8 w-7 rounded-md bg-[#0b1220] border border-slate-700 text-slate-300 font-bold text-xs hover:text-white cursor-pointer"
            >
              +
            </button>
          </div>
        </Row>
        <Row label="Parallel (P)">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onUpdateParallelCount(Math.max(1, parallelCount - 1))}
              className="h-8 w-7 rounded-md bg-[#0b1220] border border-slate-700 text-slate-300 font-bold text-xs hover:text-white cursor-pointer"
            >
              -
            </button>
            <input
              type="number"
              min={1}
              max={12}
              value={parallelCount}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= 12) onUpdateParallelCount(val);
              }}
              className="flex-1 min-w-0 bg-[#0b1220] border border-slate-700 rounded-md h-8 text-center text-xs font-mono font-bold text-indigo-300"
            />
            <button
              onClick={() => onUpdateParallelCount(Math.min(12, parallelCount + 1))}
              className="h-8 w-7 rounded-md bg-[#0b1220] border border-slate-700 text-slate-300 font-bold text-xs hover:text-white cursor-pointer"
            >
              +
            </button>
          </div>
        </Row>
        <Row label="Topology">
          <span className="text-xs font-mono font-bold text-cyan-300">
            {seriesCount}S{parallelCount}P · {cells.length} cells
          </span>
        </Row>
      </Group>

      <Group title="Operation">
        <Row label="Mode">
          <select className={inputClass} value={simulationMode} onChange={(e) => onChangeMode(e.target.value as SimulationMode)}>
            <option value="idle">Idle / Standby</option>
            <option value="charging_cccv">Charge CC/CV</option>
            <option value="discharging_load">Discharge load</option>
            <option value="balancing_active">Active balance</option>
            <option value="balancing_passive">Passive balance</option>
            <option value="stress_test">Overload stress test</option>
          </select>
        </Row>
        <Row label="Profile">
          <select
            className={inputClass}
            value={loadProfile}
            onChange={(e) => {
              const key = e.target.value as LoadProfile;
              onChangeLoadProfile(key);
              const p = LOAD_PROFILES[key];
              if (p) onUpdateConfig({ loadCurrent: p.current });
            }}
          >
            {Object.entries(LOAD_PROFILES).map(([key, p]) => (
              <option key={key} value={key}>
                {p.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Speed">
          <select
            className={inputClass}
            value={config.simulationSpeed}
            onChange={(e) => onUpdateConfig({ simulationSpeed: Number(e.target.value) })}
          >
            {[1, 2, 5, 10].map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </Row>
      </Group>

      <Group title="Currents">
        <Row label="Discharge">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={60}
              step={0.5}
              value={config.loadCurrent}
              onChange={(e) => onUpdateConfig({ loadCurrent: parseFloat(e.target.value) })}
              className="flex-1 accent-amber-400 cursor-pointer"
            />
            <input
              type="number"
              min={1}
              max={60}
              step={0.5}
              value={config.loadCurrent}
              onChange={(e) => onUpdateConfig({ loadCurrent: Number(e.target.value) || 1 })}
              className={numClass}
            />
            <span className="text-[10px] text-slate-500 w-3">A</span>
          </div>
        </Row>
        <Row label="Charge">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={40}
              step={0.5}
              value={config.chargeCurrent}
              onChange={(e) => onUpdateConfig({ chargeCurrent: parseFloat(e.target.value) })}
              className="flex-1 accent-emerald-400 cursor-pointer"
            />
            <input
              type="number"
              min={1}
              max={40}
              step={0.5}
              value={config.chargeCurrent}
              onChange={(e) => onUpdateConfig({ chargeCurrent: Number(e.target.value) || 1 })}
              className={numClass}
            />
            <span className="text-[10px] text-slate-500 w-3">A</span>
          </div>
        </Row>
        <Row label="Balance ΔV">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={5}
              max={80}
              step={1}
              value={config.balanceThresholdMv}
              onChange={(e) => onUpdateConfig({ balanceThresholdMv: parseInt(e.target.value, 10) })}
              className="flex-1 accent-cyan-400 cursor-pointer"
            />
            <input
              type="number"
              min={5}
              max={80}
              value={config.balanceThresholdMv}
              onChange={(e) => onUpdateConfig({ balanceThresholdMv: Number(e.target.value) || 12 })}
              className={numClass}
            />
            <span className="text-[10px] text-slate-500">mV</span>
          </div>
        </Row>
      </Group>

      <Group title="Environment">
        <Row label="Ambient">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={-20}
              max={50}
              step={1}
              value={config.ambientTemp}
              onChange={(e) => onUpdateConfig({ ambientTemp: parseInt(e.target.value, 10) })}
              className="flex-1 accent-rose-400 cursor-pointer"
            />
            <input
              type="number"
              min={-20}
              max={50}
              value={config.ambientTemp}
              onChange={(e) => onUpdateConfig({ ambientTemp: Number(e.target.value) })}
              className={numClass}
            />
            <span className="text-[10px] text-slate-500">°C</span>
          </div>
        </Row>
        <Row label="Cooling">
          <button
            onClick={() => onUpdateConfig({ activeCooling: !config.activeCooling })}
            className={`w-full h-8 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer border ${
              config.activeCooling
                ? 'bg-cyan-600 text-white border-cyan-400'
                : 'bg-[#0b1220] text-slate-400 border-slate-700'
            }`}
          >
            <Fan className={`w-3.5 h-3.5 ${config.activeCooling ? 'animate-spin' : ''}`} />
            {config.activeCooling ? 'ON' : 'OFF'}
          </button>
        </Row>
      </Group>

      <Group title="Cell select">
        <Row label="Cell">
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const prev = (selIdx - 1 + cells.length) % cells.length;
                playCellClickSound(560);
                onSelectCell(cells[prev].id);
              }}
              className="h-8 w-8 shrink-0 rounded-md bg-[#0b1220] border border-slate-700 text-slate-300 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4 mx-auto" />
            </button>
            <select
              className={inputClass}
              value={selectedCellId}
              onChange={(e) => onSelectCell(Number(e.target.value))}
            >
              {cells.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.id} · {c.voltage.toFixed(3)}V · {c.soc.toFixed(0)}%
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                const next = (selIdx + 1) % cells.length;
                playCellClickSound(620);
                onSelectCell(cells[next].id);
              }}
              className="h-8 w-8 shrink-0 rounded-md bg-[#0b1220] border border-slate-700 text-slate-300 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4 mx-auto" />
            </button>
          </div>
        </Row>
        {selected && (
          <div className="grid grid-cols-3 gap-1.5">
            <div className="rounded-md border border-slate-800 bg-[#0b1220] px-1.5 py-1 text-center">
              <div className="text-[9px] text-slate-500">Voltage</div>
              <div className="text-[11px] font-mono font-bold text-cyan-300">{selected.voltage.toFixed(3)} V</div>
            </div>
            <div className="rounded-md border border-slate-800 bg-[#0b1220] px-1.5 py-1 text-center">
              <div className="text-[9px] text-slate-500">SoC</div>
              <div className="text-[11px] font-mono font-bold text-emerald-300">{selected.soc.toFixed(1)}%</div>
            </div>
            <div className="rounded-md border border-slate-800 bg-[#0b1220] px-1.5 py-1 text-center">
              <div className="text-[9px] text-slate-500">Temp</div>
              <div className="text-[11px] font-mono font-bold text-amber-300">{selected.temperature.toFixed(1)}°C</div>
            </div>
          </div>
        )}
      </Group>

      <Group title="Actions">
        <button
          onClick={onAutoBalance}
          disabled={isAutoBalancing}
          className="w-full h-8 rounded-md text-xs font-bold bg-cyan-600 text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <Sparkles className={`w-3.5 h-3.5 ${isAutoBalancing ? 'animate-spin' : ''}`} />
          Auto-balance
        </button>
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={onRandomizeImbalance} className="h-8 rounded-md text-[11px] font-medium bg-[#0b1220] border border-slate-700 text-slate-200 flex items-center justify-center gap-1 cursor-pointer">
            <Shuffle className="w-3 h-3" /> Imbalance
          </button>
          <button onClick={onResetPack} className="h-8 rounded-md text-[11px] font-medium bg-[#0b1220] border border-slate-700 text-slate-200 flex items-center justify-center gap-1 cursor-pointer">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button onClick={onOpenReports} className="h-8 rounded-md text-[11px] font-medium bg-[#0b1220] border border-slate-700 text-slate-200 flex items-center justify-center gap-1 cursor-pointer">
            <FileText className="w-3 h-3 text-amber-400" /> Reports
          </button>
          <button onClick={onViewReport} className="h-8 rounded-md text-[11px] font-medium bg-[#0b1220] border border-slate-700 text-slate-200 flex items-center justify-center gap-1 cursor-pointer">
            <Eye className="w-3 h-3 text-cyan-400" /> Last report
          </button>
        </div>
      </Group>
    </div>
  );
}
