import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  BatteryChemistryType, 
  CellData, 
  ViewMode, 
  SimulationMode, 
  LoadProfile, 
  PackConfig, 
  BmsTelemetry,
  SessionSnapshot
} from './types/battery';
import { BATTERY_CHEMISTRIES } from './data/batteryChemistryData';
import { initializeCellStack, stepSimulationTick, computeProfileCurrent, socFromVoltage } from './utils/simulation';
import { playAlarmSound, playBalanceBeep, playRelayClickSound, playCellClickSound } from './utils/audio';

import { Header } from './components/Header';
import { StackVisualizer } from './components/StackVisualizer';
import { CellInspector } from './components/CellInspector';
import { PackControls } from './components/PackControls';
import { BmsLogsModal, BmsLogEvent } from './components/BmsLogsModal';
import { ElectricalOverview } from './components/dashboard/ElectricalOverview';
import { computeElectrical, accumulateEnergy, EMPTY_ENERGY, type EnergyCounters } from './utils/electrical';
import { PackWaveforms } from './components/PackWaveforms';
import { downloadCellPdf, createStoredReport, downloadStoredReportPdf, type ReportContext } from './utils/reportGenerator';
import { downloadPackCsv, downloadCellCsv } from './utils/csvExport';
import { evaluateAlarms, buildScheduledWarning, makeAlarmRecord, currentLimitA, type Alarm, type AlarmRecord, type AlarmSolution } from './utils/alarmSystem';
import { AlarmOverlay } from './components/AlarmOverlay';
import { RealtimeReportModal } from './components/RealtimeReportModal';
import { BatterySetupWizard } from './components/BatterySetupWizard';
import { loadState, saveState, clearState } from './utils/persistence';
import { KpiStrip } from './components/dashboard/KpiStrip';
import { DashboardSidebar, type DashTab } from './components/dashboard/DashboardSidebar';
import { PanelLeft, X, Eye, FileSpreadsheet, FileText, HardDriveDownload, Trash2 } from 'lucide-react';

export default function App() {
  // Chemistry State
  // Previous session data, restored from offline storage (if any)
  const restored = useMemo(() => loadState(), []);
  const [restoredInfo, setRestoredInfo] = useState<{ savedAt: number; cells: number } | null>(
    restored ? { savedAt: restored.savedAt, cells: restored.cells.length } : null
  );
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(restored?.savedAt ?? null);

  const [chemistry, setChemistry] = useState<BatteryChemistryType>(restored?.chemistry ?? 'li-ion');
  const chemistrySpec = useMemo(() => BATTERY_CHEMISTRIES[chemistry], [chemistry]);

  // Topology State
  const [seriesCount, setSeriesCount] = useState<number>(restored?.seriesCount ?? 8);
  const [parallelCount, setParallelCount] = useState<number>(restored?.parallelCount ?? 1);

  // Pack Config — sanitized so a bad/older saved value can't inject NaN
  const [config, setConfig] = useState<PackConfig>(() => {
    const d: PackConfig = {
      seriesCount: 8,
      parallelCount: 1,
      ambientTemp: 25,
      loadCurrent: 12.0,
      chargeCurrent: 4.0,
      activeCooling: false,
      simulationSpeed: 1,
      balanceThresholdMv: 12,
    };
    const saved = restored?.config;
    if (!saved) return d;
    const numOr = (v: unknown, f: number, min: number, max: number): number => {
      const n = Number(v);
      if (!Number.isFinite(n)) return f;
      return Math.min(max, Math.max(min, n));
    };
    return {
      seriesCount: numOr(saved.seriesCount, 8, 1, 32),
      parallelCount: numOr(saved.parallelCount, 1, 1, 12),
      ambientTemp: numOr(saved.ambientTemp, 25, -40, 80),
      loadCurrent: numOr(saved.loadCurrent, 12, 0.5, 300),
      chargeCurrent: numOr(saved.chargeCurrent, 4, 0.5, 300),
      activeCooling: typeof saved.activeCooling === 'boolean' ? saved.activeCooling : false,
      simulationSpeed: numOr(saved.simulationSpeed, 1, 1, 10),
      balanceThresholdMv: numOr(saved.balanceThresholdMv, 12, 1, 200),
    };
  });

  // Simulation Operational Mode
  const [simulationMode, setSimulationMode] = useState<SimulationMode>('idle');
  const [loadProfile, setLoadProfile] = useState<LoadProfile>(restored?.loadProfile ?? 'custom');

  // Multi-Cell Stack Array — previous data if available (sanitized), else a fresh stack
  const [cells, setCells] = useState<CellData[]>(() => {
    const saved = restored?.cells;
    if (saved?.length) {
      const ok = (v: unknown, f: number): number => {
        const n = Number(v);
        return Number.isFinite(n) ? n : f;
      };
      const spec = BATTERY_CHEMISTRIES[restored!.chemistry] ?? BATTERY_CHEMISTRIES['li-ion'];
      return saved.map((c, i) => {
        const soc = Math.max(0, Math.min(100, ok(c.soc, 78)));
        const nominal = ok(c.capacityNominal, spec.typicalCapacity) || spec.typicalCapacity;
        return {
          ...c,
          id: ok(c.id, i + 1),
          label: typeof c.label === 'string' && c.label ? c.label : `Cell #${i + 1}`,
          voltage: Math.max(spec.cutoffVoltage, Math.min(spec.maxVoltage, ok(c.voltage, spec.nominalVoltage))),
          soc,
          soh: Math.max(0, Math.min(100, ok(c.soh, 98))),
          temperature: ok(c.temperature, 25),
          internalResistance: Math.max(0.05, ok(c.internalResistance, spec.typicalIR)),
          capacityNominal: nominal,
          capacityRemaining: Math.max(0, ok(c.capacityRemaining, (soc / 100) * nominal)),
          cycles: Math.max(0, ok(c.cycles, 0)),
          balanceBleedCurrent: Math.max(0, ok(c.balanceBleedCurrent, 0)),
          history: Array.isArray(c.history) ? c.history.slice(-180) : [],
          row: ok(c.row, Math.floor(i / Math.max(1, restored!.parallelCount))),
          col: ok(c.col, i),
          parallelGroup: ok(c.parallelGroup, i % Math.max(1, restored!.parallelCount)),
        };
      });
    }
    return initializeCellStack(8, 1, 'li-ion', 78, true);
  });

  // Selected Cell ID for Detailed Individual Inspection
  const [selectedCellId, setSelectedCellId] = useState<number>(1);

  // View Mode
  const [viewMode, setViewMode] = useState<ViewMode>('physical');

  // Auto-Balancing in progress flag
  const [isAutoBalancing, setIsAutoBalancing] = useState<boolean>(false);

  // Run / Stop simulation engine
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [elapsedMs, setElapsedMs] = useState<number>(restored?.elapsedMs ?? 0);
  const [tickCount, setTickCount] = useState<number>(restored?.tickCount ?? 0);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [snapshots, setSnapshots] = useState<SessionSnapshot[]>(restored?.snapshots ?? []);
  const [liveCurrent, setLiveCurrent] = useState<number>(0);
  const tickRef = useRef(restored?.tickCount ?? 0);
  const elapsedRef = useRef(restored?.elapsedMs ?? 0);

  // Modals State
  const [energy, setEnergy] = useState<EnergyCounters>(restored?.energy ?? EMPTY_ENERGY);
  const energyRef = useRef<EnergyCounters>(restored?.energy ?? EMPTY_ENERGY);
  const [runStartElapsed, setRunStartElapsed] = useState<number>(0);
  const [isLogsOpen, setIsLogsOpen] = useState<boolean>(false);
  const [isRealtimeReportOpen, setIsRealtimeReportOpen] = useState<boolean>(false);
  const [isWizardOpen, setIsWizardOpen] = useState<boolean>(!restored);
  const [hasSetup, setHasSetup] = useState<boolean>(!!restored);
  const [dashTab, setDashTab] = useState<DashTab>('overview');
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);

  // BMS emergency alarm system
  const [activeAlarms, setActiveAlarms] = useState<Alarm[]>([]);
  const [suppressUntil, setSuppressUntil] = useState<Record<string, number>>({});
  const alarmsRef = useRef<Alarm[]>([]);

  // BMS Event Log Chronicle
  const [logs, setLogs] = useState<BmsLogEvent[]>(() => [
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      type: 'info',
      message: restored
        ? `Previous session restored · ${restored.cells.length} cells · saved ${new Date(restored.savedAt).toLocaleString()}.`
        : 'e-BMS initialized · 8S string · contactors open · IMD armed.',
    }
  ]);

  // Append Log Helper
  const addLog = useCallback((type: BmsLogEvent['type'], message: string, cellId?: number, voltage?: number) => {
    setLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toLocaleTimeString(),
        type,
        cellId,
        message,
        voltage,
      },
      ...prev.slice(0, 99), // keep latest 100 entries
    ]);
  }, []);

  const resetSessionClock = useCallback(() => {
    tickRef.current = 0;
    elapsedRef.current = 0;
    setTickCount(0);
    setElapsedMs(0);
    setSnapshots([]);
    setSessionStartedAt(null);
    setIsRunning(false);
    energyRef.current = EMPTY_ENERGY;
    setEnergy(EMPTY_ENERGY);
    setRunStartElapsed(0);
  }, []);

  // Apply the selected cell type to the existing string
  const handleApplyCellType = useCallback(
    (nextChem: BatteryChemistryType) => {
      const spec = BATTERY_CHEMISTRIES[nextChem];
      setChemistry(nextChem);
      setCells(initializeCellStack(seriesCount, parallelCount, nextChem, 80, true));
      setSelectedCellId(1);
      setSimulationMode('idle');
      setIsAutoBalancing(false);
      resetSessionClock();
      setHasSetup(true);
      setIsWizardOpen(false);
      addLog(
        'info',
        `Cell type set to ${spec.name} — ${seriesCount}S${parallelCount}P, ${(spec.nominalVoltage * seriesCount).toFixed(1)} V nominal.`
      );
    },
    [seriesCount, parallelCount, addLog, resetSessionClock]
  );

  // Handler: Change Chemistry
  const handleSelectChemistry = useCallback((newChem: BatteryChemistryType) => {
    setChemistry(newChem);
    const newCells = initializeCellStack(seriesCount, parallelCount, newChem, 80, true);
    setCells(newCells);
    setSelectedCellId(1);
    addLog('info', `Cell type set to ${BATTERY_CHEMISTRIES[newChem].name} (${BATTERY_CHEMISTRIES[newChem].nominalVoltage.toFixed(2)} V nominal).`);
  }, [seriesCount, parallelCount, addLog]);

  // Handler: Update Series Count
  const handleUpdateSeriesCount = useCallback((newSeries: number) => {
    setSeriesCount(newSeries);
    setConfig((prev) => ({ ...prev, seriesCount: newSeries }));
    const newCells = initializeCellStack(newSeries, parallelCount, chemistry, 78, true);
    setCells(newCells);
    setSelectedCellId(1);
    resetSessionClock();
    addLog('info', `Updated pack topology to ${newSeries}S series stack (${newSeries * parallelCount} total cells)`);
  }, [parallelCount, chemistry, addLog, resetSessionClock]);

  // Handler: Update Parallel Count
  const handleUpdateParallelCount = useCallback((newParallel: number) => {
    setParallelCount(newParallel);
    setConfig((prev) => ({ ...prev, parallelCount: newParallel }));
    const newCells = initializeCellStack(seriesCount, newParallel, chemistry, 78, true);
    setCells(newCells);
    setSelectedCellId(1);
    resetSessionClock();
    addLog('info', `Updated pack parallel branches to ${newParallel}P`);
  }, [seriesCount, chemistry, addLog, resetSessionClock]);

  // Handler: Update Partial Config
  const handleUpdateConfig = useCallback((partial: Partial<PackConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  // Compute Pack Telemetry
  const telemetry: BmsTelemetry = useMemo(() => {
    if (cells.length === 0) {
      return {
        packVoltage: 0,
        packCurrent: 0,
        packPower: 0,
        packSoC: 0,
        packSoH: 100,
        packCapacityRemaining: 0,
        packCapacityTotal: 0,
        packEnergyRemaining: 0,
        minVoltage: 0,
        minVoltageCellId: 1,
        maxVoltage: 0,
        maxVoltageCellId: 1,
        avgVoltage: 0,
        deltaVoltage: 0,
        avgTemperature: 25,
        maxTemperature: 25,
        maxTempCellId: 1,
        minTemperature: 25,
        coolingFanSpeed: 0,
        bmsState: simulationMode,
        safetyRelayClosed: true,
        warnings: [],
        faults: [],
        estimatedTimeRemainingSec: 0,
      };
    }

    // Series pack voltage = sum of series-group averages (parallels averaged)
    let packV = 0;
    for (let s = 0; s < seriesCount; s++) {
      let pSum = 0;
      let n = 0;
      for (let p = 0; p < parallelCount; p++) {
        const c = cells[s * parallelCount + p];
        if (c) {
          pSum += c.voltage;
          n += 1;
        }
      }
      packV += pSum / Math.max(1, n);
    }

    let totalSoc = 0;
    let minV = Infinity;
    let maxV = -Infinity;
    let minVId = cells[0].id;
    let maxVId = cells[0].id;
    let maxT = -Infinity;
    let minT = Infinity;
    let maxTId = cells[0].id;
    let totalT = 0;
    let cellVSum = 0;

    cells.forEach((c) => {
      cellVSum += c.voltage;
      totalSoc += c.soc;
      totalT += c.temperature;

      if (c.voltage < minV) {
        minV = c.voltage;
        minVId = c.id;
      }
      if (c.voltage > maxV) {
        maxV = c.voltage;
        maxVId = c.id;
      }
      if (c.temperature > maxT) {
        maxT = c.temperature;
        maxTId = c.id;
      }
      if (c.temperature < minT) {
        minT = c.temperature;
      }
    });

    const avgV = cellVSum / cells.length;
    const avgSoc = totalSoc / cells.length;
    const avgT = totalT / cells.length;
    const deltaV = Math.max(0, (maxV - minV) * 1000); // in mV
    const totalV = packV;

    // Pack current = live measured value from the running drive-cycle profile
    const current = liveCurrent;

    const packPower = totalV * current;

    // Remaining capacity and energy
    const cellCapAh = (chemistrySpec.typicalCapacity / 1000) * parallelCount;
    const packCapRemainingAh = cellCapAh * (avgSoc / 100);
    const packEnergyWh = totalV * packCapRemainingAh;

    // Estimated runtime remaining
    let estSec = 0;
    if (current < -0.1) {
      estSec = (packCapRemainingAh / Math.abs(current)) * 3600;
    } else if (current > 0.1) {
      const neededAh = cellCapAh * ((100 - avgSoc) / 100);
      estSec = (neededAh / current) * 3600;
    }

    // BMS Faults and Warnings
    const warnings: string[] = [];
    const faults: string[] = [];

    if (deltaV > 50) warnings.push(`High Cell Voltage Imbalance (${deltaV.toFixed(1)} mV)`);
    if (maxT > chemistrySpec.tempMax) warnings.push(`Cell #${maxTId} High Temperature (${maxT.toFixed(1)}°C)`);
    if (maxV > chemistrySpec.maxVoltage + 0.05) faults.push(`Cell #${maxVId} Over-Voltage Protection Triggered`);
    if (minV < chemistrySpec.cutoffVoltage - 0.05) faults.push(`Cell #${minVId} Under-Voltage Protection Triggered`);
    if (maxT >= chemistrySpec.thermalRunawayTemp) faults.push(`Cell #${maxTId} Thermal Runaway Alarm`);

    const safetyRelayClosed = faults.length === 0;

    return {
      packVoltage: Number(totalV.toFixed(2)),
      packCurrent: Number(current.toFixed(1)),
      packPower: Number(packPower.toFixed(1)),
      packSoC: Number(avgSoc.toFixed(1)),
      packSoH: 98,
      packCapacityRemaining: Number(packCapRemainingAh.toFixed(2)),
      packCapacityTotal: Number(cellCapAh.toFixed(2)),
      packEnergyRemaining: Number(packEnergyWh.toFixed(1)),
      minVoltage: Number(minV.toFixed(3)),
      minVoltageCellId: minVId,
      maxVoltage: Number(maxV.toFixed(3)),
      maxVoltageCellId: maxVId,
      avgVoltage: Number(avgV.toFixed(3)),
      deltaVoltage: Number(deltaV.toFixed(1)),
      avgTemperature: Number(avgT.toFixed(1)),
      maxTemperature: Number(maxT.toFixed(1)),
      maxTempCellId: maxTId,
      minTemperature: Number(minT.toFixed(1)),
      coolingFanSpeed: config.activeCooling ? 100 : (maxT > 45 ? 65 : 0),
      bmsState: simulationMode,
      safetyRelayClosed,
      warnings,
      faults,
      estimatedTimeRemainingSec: estSec,
    };
  }, [cells, simulationMode, config, chemistrySpec, parallelCount, seriesCount, liveCurrent]);

  // Electrical system state: contactor sequencing, DC-link, shunt, DCIR, insulation monitor
  const electrical = useMemo(
    () =>
      computeElectrical({
        telemetry,
        cells,
        seriesCount,
        parallelCount,
        isRunning,
        msSinceRunStart: Math.max(0, elapsedMs - runStartElapsed),
        tickCount,
      }),
    [telemetry, cells, seriesCount, parallelCount, isRunning, elapsedMs, runStartElapsed, tickCount]
  );

  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;
  const configRef = useRef(config);
  configRef.current = config;
  const modeRef = useRef(simulationMode);
  modeRef.current = simulationMode;
  const balancingRef = useRef(isAutoBalancing);
  balancingRef.current = isAutoBalancing;
  const profileRef = useRef(loadProfile);
  profileRef.current = loadProfile;
  const isRunningRef = useRef(isRunning);
  isRunningRef.current = isRunning;

  // Simulation Tick Interval — only while RUN is engaged
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      const t = telemetryRef.current;
      const cfg = configRef.current;
      const mode = modeRef.current;
      const dtSeconds = 0.2 * cfg.simulationSpeed;
      const simTimeSec = (tickRef.current + 1) * dtSeconds;
      const effectiveCurrent = computeProfileCurrent(
        mode,
        profileRef.current,
        cfg,
        simTimeSec,
        t.maxVoltage,
        t.minVoltage,
        chemistrySpec,
        t.packSoC
      );
      setLiveCurrent(Number(effectiveCurrent.toFixed(3)));

      setCells((prevCells) => {
        const { updatedCells } = stepSimulationTick(
          prevCells,
          chemistrySpec,
          mode,
          cfg,
          effectiveCurrent,
          dtSeconds
        );
        return updatedCells;
      });

      tickRef.current += 1;
      elapsedRef.current += 150;
      setTickCount(tickRef.current);
      setElapsedMs(elapsedRef.current);

      // Energy / charge counters (coulomb + watt-hour metering on the shunt)
      energyRef.current = accumulateEnergy(energyRef.current, effectiveCurrent, t.packVoltage, dtSeconds);
      setEnergy(energyRef.current);

      setSnapshots((prev) => [
        ...prev.slice(-239),
        {
          time: Date.now(),
          elapsedMs: elapsedRef.current,
          packVoltage: t.packVoltage,
          packCurrent: Number(effectiveCurrent.toFixed(3)),
          packPower: Number((t.packVoltage * effectiveCurrent).toFixed(2)),
          packSoC: t.packSoC,
          avgTemp: t.avgTemperature,
          maxTemp: t.maxTemperature,
          deltaMv: t.deltaVoltage,
          minVoltage: t.minVoltage,
          maxVoltage: t.maxVoltage,
        },
      ]);

      if (balancingRef.current && t.deltaVoltage <= 10) {
        setIsAutoBalancing(false);
        setSimulationMode('idle');
        playBalanceBeep();
        addLog('info', `Pack auto-balancing complete! All cells equalized within Δ < 10mV.`);
      }
    }, 150);

    return () => clearInterval(interval);
  }, [isRunning, chemistrySpec, addLog]);

  // ── Warning engine ─────────────────────────────────────────────────────
  // Press Run  →  first warning at 10 s, then a new one every 60 s while running.
  // Content comes from the selected cell type's own limits. Every warning and the
  // action taken is recorded (event log + reports).
  const FIRST_WARNING_DELAY_MS = 10_000;
  const WARNING_GAP_MS = 60_000;
  const currentWarningRef = useRef<Alarm | null>(null);
  const nextWarningAtRef = useRef(0);
  const rotateRef = useRef(0);
  const historyRef = useRef<AlarmRecord[]>([]);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const suppressRef = useRef(suppressUntil);
  suppressRef.current = suppressUntil;
  const [currentWarning, setCurrentWarningState] = useState<Alarm | null>(null);
  const [alarmHistory, setAlarmHistoryState] = useState<AlarmRecord[]>([]);

  const setCurrentWarning = (a: Alarm | null) => {
    currentWarningRef.current = a;
    setCurrentWarningState(a);
  };
  const pushHistory = (records: AlarmRecord[]) => {
    historyRef.current = records.slice(0, 60);
    setAlarmHistoryState(historyRef.current);
  };

  // Run pressed → first warning after 10 s. Stopped → clear everything.
  useEffect(() => {
    if (isRunning) {
      nextWarningAtRef.current = Date.now() + FIRST_WARNING_DELAY_MS;
    } else {
      setCurrentWarning(null);
      setActiveAlarms([]);
      alarmsRef.current = [];
    }
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => {
      const t = telemetryRef.current;
      const now = Date.now();
      const isSuppressed = (key: string) => (suppressRef.current[key] ?? 0) > now;

      // Real protection faults (if any) — tracked in history, shown with priority
      const threats = evaluateAlarms(t, cellsRef.current, chemistrySpec).filter((a) => !isSuppressed(a.key));
      const prev = alarmsRef.current;
      const raised = threats.filter((a) => !prev.some((p) => p.key === a.key));
      const cleared = prev.filter((a) => !threats.some((x) => x.key === a.key));
      alarmsRef.current = threats;

      let hist = historyRef.current;
      for (const a of raised) {
        hist = [makeAlarmRecord(a), ...hist];
        addLog(a.severity === 'critical' ? 'fault' : 'warning', `ALARM RAISED — ${a.title} · ${a.measured} vs limit ${a.limit}${a.cellId ? ` · cell #${a.cellId}` : ''}`);
      }
      for (const a of cleared) {
        hist = hist.map((r) => (r.key === a.key && r.outcome === 'pending' ? { ...r, resolvedAt: now, outcome: 'auto-cleared' as const } : r));
        addLog('info', `THREAT CLEARED — ${a.title} returned to normal.`);
      }
      if (raised.length || cleared.length) pushHistory(hist);

      // A new trip-level fault interrupts straight away; everything else follows the 10 s timer
      const urgent = raised.find((a) => a.severity === 'critical');
      const due = now >= nextWarningAtRef.current;

      if (urgent && !currentWarningRef.current) {
        setCurrentWarning(urgent);
        nextWarningAtRef.current = now + WARNING_GAP_MS;
        playAlarmSound('fault');
      } else if (due) {
        // Pick the warning: a live fault if there is one (rotating), else the highest-risk parameter
        const warn = threats.length > 0 ? threats[rotateRef.current++ % threats.length] : buildScheduledWarning(t, cellsRef.current, chemistrySpec);
        if (!threats.some((a) => a.key === warn.key)) {
          // scheduled warning → close any earlier unanswered one, then open a record for this one
          pushHistory([
            makeAlarmRecord(warn),
            ...historyRef.current.map((r) => (r.key === 'watch' && r.outcome === 'pending' ? { ...r, resolvedAt: now, outcome: 'deferred' as const } : r)),
          ]);
          addLog('warning', `WARNING — ${warn.title} · ${warn.measured} vs limit ${warn.limit}${warn.cellId ? ` · cell #${warn.cellId}` : ''}`);
        }
        setCurrentWarning(warn);
        nextWarningAtRef.current = now + WARNING_GAP_MS;
        playAlarmSound(warn.severity === 'critical' ? 'fault' : 'warning');
      } else if (currentWarningRef.current) {
        // Keep the open warning's numbers live
        const cur = currentWarningRef.current;
        const live = cur.key === 'watch' ? buildScheduledWarning(t, cellsRef.current, chemistrySpec) : threats.find((a) => a.key === cur.key);
        if (live) setCurrentWarning(live);
      }

      // Red hue / banner follow whatever is on screen plus any live faults
      const cw = currentWarningRef.current;
      setActiveAlarms(cw && !threats.some((a) => a.key === cw.key) ? [cw, ...threats] : threats);
    }, 500);
    return () => clearInterval(id);
  }, [isRunning, chemistrySpec, addLog]);

  // ── Offline autosave: keeps previous data so reloads restore it (no internet needed) ──
  useEffect(() => {
    if (!cells.length) return;
    const savedAt = saveState({
      chemistry,
      cells,
      seriesCount,
      parallelCount,
      config,
      simulationMode,
      loadProfile,
      alarmHistory: historyRef.current,
      snapshots: snapshots.slice(-120),
      energy,
      tickCount: tickRef.current,
      elapsedMs: elapsedRef.current,
      hasSetup,
    });
    if (savedAt) setLastSavedAt(savedAt);
  }, [cells, chemistry, seriesCount, parallelCount, config, simulationMode, loadProfile, snapshots, energy, hasSetup]);

  const discardPreviousData = useCallback(() => {
    clearState();
    setRestoredInfo(null);
    setLastSavedAt(null);
    const fresh = initializeCellStack(seriesCount, parallelCount, chemistry, 78, true);
    setCells(fresh);
    setSnapshots([]);
    setAlarmHistoryState([]);
    historyRef.current = [];
    setEnergy(EMPTY_ENERGY);
    energyRef.current = EMPTY_ENERGY;
    tickRef.current = 0;
    elapsedRef.current = 0;
    setTickCount(0);
    setElapsedMs(0);
    addLog('info', 'Previous data cleared — fresh 78% SoC stack initialized.');
  }, [seriesCount, parallelCount, chemistry, addLog]);

  // Clear an injected fault / capped temperature on a specific cell (used by solutions)
  const clearCellFault = useCallback((cellId: number, capTemp?: number) => {
    setCells((prev) =>
      prev.map((c) => {
        if (c.id !== cellId) return c;
        return {
          ...c,
          temperature: capTemp !== undefined ? Math.min(c.temperature, capTemp) : c.temperature,
          faultType: 'none',
          injectedFault: false,
          status: 'normal',
        };
      })
    );
  }, []);

  // Reset the runaway cells back to ambient under cooling
  const resetRunawayCells = useCallback(() => {
    setCells((prev) =>
      prev.map((c) =>
        c.faultType === 'thermal_runaway' || c.temperature >= chemistrySpec.thermalRunawayTemp
          ? {
              ...c,
              temperature:
                (Number.isFinite(configRef.current.ambientTemp) ? configRef.current.ambientTemp : 25) + 4,
              faultType: 'none',
              injectedFault: false,
              status: 'normal',
              polarization: 0,
              isBalancing: false,
              balanceBleedCurrent: 0,
            }
          : c
      )
    );
  }, [chemistrySpec]);

  const closeCurrentWarning = useCallback(() => {
    setCurrentWarning(null);
  }, []);

  const markResolved = useCallback((key: string, actionTaken: string) => {
    pushHistory(
      historyRef.current.map((r) =>
        r.key === key && (r.outcome === 'pending' || r.outcome === 'deferred')
          ? { ...r, resolvedAt: Date.now(), actionTaken, outcome: 'resolved' as const }
          : r
      )
    );
  }, []);

  // ── Apply one of the three warning-specific solution options ──
  const applySolution = useCallback(
    (alarm: Alarm, solution: AlarmSolution) => {
      // Guard against restored data missing numeric fields — never let a bad
      // value blank the dashboard.
      const num = (v: unknown, fallback: number): number =>
        Number.isFinite(v as number) ? (v as number) : fallback;

      const t = {
        ...telemetryRef.current,
        packCapacityTotal: num(telemetryRef.current.packCapacityTotal, 1),
        packCapacityRemaining: num(telemetryRef.current.packCapacityRemaining, 0),
        maxVoltageCellId: num(telemetryRef.current.maxVoltageCellId, cells[0]?.id ?? 1),
        minVoltageCellId: num(telemetryRef.current.minVoltageCellId, cells[0]?.id ?? 1),
        maxTempCellId: num(telemetryRef.current.maxTempCellId, cells[0]?.id ?? 1),
        packCurrent: num(telemetryRef.current.packCurrent, 0),
      };
      const derate = (a: number) => Math.max(2, Math.round(num(a, 8) * 0.25));
      const half = (a: number) => Math.max(2, Math.round(num(a, 8) * 0.5));
      const clampPositive = (v: number) => (Number.isFinite(v) && v > 0 ? v : 2);

      try {
        switch (solution.id) {
        // ── Thermal runaway (49) ──
        case 'isolate_cell_only': {
          resetRunawayCells();
          setConfig((prev) => ({ ...prev, activeCooling: true }));
          break;
        }
        case 'isolate_and_shutdown': {
          resetRunawayCells();
          setConfig((prev) => ({ ...prev, activeCooling: true }));
          setSimulationMode('idle');
          break;
        }
        case 'runaway_bypass_n1': {
          resetRunawayCells();
          setConfig((prev) => ({ ...prev, activeCooling: true, loadCurrent: half(prev.loadCurrent) }));
          addLog('warning', `CELL QUARANTINED — module section bypassed for replacement; string derated to 50% (N-1 operation).`);
          break;
        }
        // ── Overcurrent (50/51) ──
        case 'throttle_current': {
          // Derate to 70% of the rated C-limit for the present direction of flow
          const { limitA, direction } = currentLimitA(t, chemistrySpec);
          const safeA = Math.max(1, Math.round(0.7 * limitA * 10) / 10);
          setConfig((prev) =>
            direction === 'discharge'
              ? { ...prev, loadCurrent: Math.min(prev.loadCurrent, safeA) }
              : { ...prev, chargeCurrent: Math.min(prev.chargeCurrent, safeA) }
          );
          break;
        }
        case 'oc_trip_k1k2': {
          setSimulationMode('idle');
          break;
        }
        case 'oc_staged_restart': {
          const { limitA, direction } = currentLimitA(t, chemistrySpec);
          const halfA = Math.max(1, Math.round(0.5 * limitA * 10) / 10);
          setConfig((prev) =>
            direction === 'discharge'
              ? { ...prev, loadCurrent: Math.min(prev.loadCurrent, halfA) }
              : { ...prev, chargeCurrent: Math.min(prev.chargeCurrent, halfA) }
          );
          break;
        }
        // ── Over-voltage (59) ──
        case 'ovp_drip_balance': {
          clearCellFault(t.maxVoltageCellId);
          setConfig((prev) => ({ ...prev, chargeCurrent: 2 }));
          setSimulationMode('balancing_active');
          setIsAutoBalancing(true);
          break;
        }
        case 'ovp_full_stop': {
          clearCellFault(t.maxVoltageCellId);
          setConfig((prev) => ({ ...prev, chargeCurrent: 0 }));
          setSimulationMode('balancing_active');
          setIsAutoBalancing(true);
          break;
        }
        case 'ovp_recalibrate_cv': {
          clearCellFault(t.maxVoltageCellId);
          setConfig((prev) => ({ ...prev, chargeCurrent: 1 }));
          setSimulationMode('idle');
          addLog('warning', `CHARGER CV RECALIBRATION — setpoint lowered 50 mV/cell; AFE sense leads flagged for verification.`);
          break;
        }
        // ── Under-voltage (27) ──
        case 'reduce_load': {
          clearCellFault(t.minVoltageCellId);
          setConfig((prev) => ({ ...prev, loadCurrent: derate(prev.loadCurrent) }));
          break;
        }
        case 'uv_open_discharge': {
          clearCellFault(t.minVoltageCellId);
          setSimulationMode('idle');
          break;
        }
        case 'uv_recovery_charge': {
          clearCellFault(t.minVoltageCellId);
          const ch = Math.max(0.5, Math.round(0.2 * Math.max(0.1, t.packCapacityTotal) * 10) / 10);
          setConfig((prev) => ({ ...prev, chargeCurrent: ch }));
          setSimulationMode('charging_cccv');
          break;
        }
        // ── Thermal overload (49T) ──
        case 'cooling_only': {
          clearCellFault(t.maxTempCellId, chemistrySpec.tempMax - 3);
          setConfig((prev) => ({ ...prev, activeCooling: true }));
          break;
        }
        case 'cool_and_derate': {
          clearCellFault(t.maxTempCellId, chemistrySpec.tempMax - 3);
          setConfig((prev) => ({
            ...prev,
            activeCooling: true,
            loadCurrent: derate(prev.loadCurrent),
            chargeCurrent: Math.min(prev.chargeCurrent, 5),
          }));
          break;
        }
        case 'ot_soak': {
          clearCellFault(t.maxTempCellId, chemistrySpec.tempMax - 3);
          setConfig((prev) => ({ ...prev, activeCooling: true }));
          setSimulationMode('idle');
          break;
        }
        // ── Imbalance (60) ──
        case 'start_balance': {
          setSimulationMode('balancing_active');
          setIsAutoBalancing(true);
          break;
        }
        case 'balance_and_derate': {
          setSimulationMode('balancing_active');
          setIsAutoBalancing(true);
          setConfig((prev) => ({
            ...prev,
            loadCurrent: derate(prev.loadCurrent),
            chargeCurrent: Math.min(prev.chargeCurrent, 5),
          }));
          break;
        }
        case 'imb_top_balance': {
          setConfig((prev) => ({ ...prev, chargeCurrent: Math.min(prev.chargeCurrent, 1) }));
          setSimulationMode('balancing_passive');
          setIsAutoBalancing(true);
          break;
        }
        // ── Low SoC (reserve) ──
        case 'start_charge': {
          const ch = Math.max(1, Math.round(0.5 * Math.max(0.1, t.packCapacityTotal) * 10) / 10);
          setConfig((prev) => ({ ...prev, chargeCurrent: ch }));
          setSimulationMode('charging_cccv');
          break;
        }
        case 'soc_open_discharge': {
          setSimulationMode('idle');
          break;
        }
        case 'soc_ship_mode': {
          setConfig((prev) => ({ ...prev, loadCurrent: clampPositive(Math.min(prev.loadCurrent, 2)) }));
          break;
        }
        }
      } catch (err) {
        // Never blank the screen over one bad field — log and continue.
        addLog('warning', `CORRECTIVE ACTION PARTIALLY APPLIED — ${alarm.title}. ${err instanceof Error ? err.message : 'unexpected value'}.`);
      }

      // A derating / isolating response takes the pack out of the overload-abuse ramp
      const leaveStress = ['throttle_current', 'reduce_load', 'cool_and_derate', 'balance_and_derate', 'isolate_cell_only', 'runaway_bypass_n1', 'oc_staged_restart', 'soc_ship_mode'];
      if (modeRef.current === 'stress_test' && leaveStress.includes(solution.id)) {
        setSimulationMode('discharging_load');
      }

      // Hold re-alerting for one scan period while the corrective action takes effect
      setSuppressUntil((prev) => ({ ...prev, [alarm.key]: Date.now() + WARNING_GAP_MS }));
      markResolved(alarm.key, solution.label);
      closeCurrentWarning();
      playCellClickSound(950);
      addLog('info', `SOLUTION APPLIED [${solution.tier.toUpperCase()}] — ${alarm.title}: ${solution.label}.`);
    },
    [chemistrySpec, addLog, clearCellFault, resetRunawayCells, markResolved, closeCurrentWarning, cells]
  );

  const deferAlarm = useCallback(
    (alarm: Alarm) => {
      setSuppressUntil((prev) => ({ ...prev, [alarm.key]: Date.now() + WARNING_GAP_MS }));
      pushHistory(
        historyRef.current.map((r) => (r.key === alarm.key && r.outcome === 'pending' ? { ...r, outcome: 'deferred' as const } : r))
      );
      closeCurrentWarning();
      addLog('warning', `ALARM ACKNOWLEDGED — ${alarm.title}: pack kept online; will re-alert automatically if the fault persists.`);
    },
    [addLog]
  );

  // Handler: Manual Cell Voltage Trim
  const handleUpdateCellVoltage = useCallback((cellId: number, newVoltage: number) => {
    setCells((prev) =>
      prev.map((c) => {
        if (c.id !== cellId) return c;
        const v = Number(newVoltage.toFixed(3));
        // Move the real state (SoC) so the edit persists through the physics tick
        const soc = socFromVoltage(v, chemistrySpec.id);
        return {
          ...c,
          soc,
          polarization: 0,
          capacityRemaining: Math.round((soc / 100) * c.capacityNominal),
          voltage: v,
          history: [
            ...c.history.slice(-179),
            {
              time: Date.now(),
              voltage: v,
              current: c.history[c.history.length - 1]?.current ?? 0,
              temperature: c.temperature,
              soc,
            },
          ],
        };
      })
    );
  }, [chemistrySpec]);

  // Handler: Inject Fault into Cell
  const handleInjectCellFault = useCallback((cellId: number, fault: CellData['faultType']) => {
    setCells((prev) =>
      prev.map((c) => {
        if (c.id !== cellId) return c;
        let v = c.voltage;
        let t = c.temperature;
        let ir = c.internalResistance;

        if (fault === 'over_voltage') v = chemistrySpec.maxVoltage + 0.15;
        if (fault === 'under_voltage') v = chemistrySpec.cutoffVoltage - 0.22;
        if (fault === 'high_temp') t = 68.0;
        if (fault === 'high_ir') ir = chemistrySpec.typicalIR * 3.2;
        if (fault === 'thermal_runaway') t = 110.0;

        return {
          ...c,
          voltage: Number(v.toFixed(3)),
          temperature: Number(t.toFixed(1)),
          internalResistance: Number(ir.toFixed(1)),
          faultType: fault,
          injectedFault: true,
          status: 'fault',
          history: [
            ...c.history.slice(-179),
            {
              time: Date.now(),
              voltage: Number(v.toFixed(3)),
              current: c.history[c.history.length - 1]?.current ?? 0,
              temperature: Number(t.toFixed(1)),
              soc: c.soc,
            },
          ],
        };
      })
    );

    addLog('fault', `Injected fault [${fault.replace('_', ' ').toUpperCase()}] into Cell #${cellId}`, cellId);
    playAlarmSound('fault');
  }, [chemistrySpec, addLog]);

  // Handler: Heal/Restore Cell
  const handleHealCell = useCallback((cellId: number) => {
    const avgV = telemetry.avgVoltage || chemistrySpec.nominalVoltage;
    setCells((prev) =>
      prev.map((c) => {
        if (c.id !== cellId) return c;
        const soc = socFromVoltage(avgV, chemistrySpec.id);
        return {
          ...c,
          soc,
          polarization: 0,
          capacityRemaining: Math.round((soc / 100) * c.capacityNominal),
          voltage: Number(avgV.toFixed(3)),
          temperature: config.ambientTemp,
          internalResistance: chemistrySpec.typicalIR,
          faultType: 'none',
          injectedFault: false,
          status: 'normal',
          isBalancing: false,
          balanceBleedCurrent: 0,
        };
      })
    );
    addLog('info', `Cell #${cellId} restored to healthy baseline and pack average voltage.`, cellId);
  }, [telemetry.avgVoltage, chemistrySpec, config.ambientTemp, addLog]);

  // Handler: Toggle Individual Cell Balance
  const handleToggleCellBalance = useCallback((cellId: number) => {
    setCells((prev) =>
      prev.map((c) => {
        if (c.id !== cellId) return c;
        const nextBal = !c.isBalancing;
        return {
          ...c,
          isBalancing: nextBal,
          balanceBleedCurrent: nextBal ? 150 : 0,
        };
      })
    );
  }, []);

  // Handler: 1-Click Auto Balance
  const handleAutoBalance = useCallback(() => {
    setIsAutoBalancing(true);
    setSimulationMode('balancing_active');
    if (!isRunningRef.current) setRunStartElapsed(elapsedRef.current);
    setIsRunning(true);
    setSessionStartedAt((prev) => prev ?? Date.now());
    addLog('balance', `Initiated automated pack equalization cycle. Active balancing shunts engaged.`);
  }, [addLog]);

  // Handler: Introduce Realistic Imbalance
  const handleRandomizeImbalance = useCallback(() => {
    setCells((prev) =>
      prev.map((c, i) => {
        // Shift real SoC (persists through physics); random spread of roughly ±6 % SoC
        const socOffset = (Math.random() - 0.5) * 12 + (i === 2 ? -5 : 0) + (i === 0 ? 4 : 0);
        const soc = Math.max(3, Math.min(99, c.soc + socOffset));
        return {
          ...c,
          soc,
          capacityRemaining: Math.round((soc / 100) * c.capacityNominal),
          temperature: Number((c.temperature + Math.random() * 4 - 1).toFixed(2)),
        };
      })
    );
    addLog('warning', `Introduced realistic cell variance across stack (ΔV increased).`);
  }, [chemistrySpec, addLog]);

  // Handler: Reset Entire Pack
  const handleResetPack = useCallback(() => {
    const newCells = initializeCellStack(seriesCount, parallelCount, chemistry, 80, false);
    setCells(newCells);
    setSimulationMode('idle');
    setIsAutoBalancing(false);
    setLiveCurrent(0);
    resetSessionClock();
    addLog('info', `Pack re-initialized to balanced 80% SoC nominal baseline.`);
  }, [seriesCount, parallelCount, chemistry, addLog, resetSessionClock]);

  const handleRun = useCallback(() => {
    setRunStartElapsed(elapsedRef.current);
    setIsRunning(true);
    setSessionStartedAt((prev) => prev ?? Date.now());
    if (modeRef.current === 'idle') {
      // Running at rest has no current → nothing would change. Apply the selected load.
      setSimulationMode('discharging_load');
      addLog('info', `RUN from idle: applying ${configRef.current.loadCurrent.toFixed(1)} A discharge load (${profileRef.current.replace(/_/g, ' ')}).`);
    } else {
      addLog('info', `Simulation RUN — mode ${modeRef.current.replace(/_/g, ' ')}.`);
    }
  }, [addLog]);

  const handleChangeMode = useCallback((mode: SimulationMode) => {
    playRelayClickSound('close');
    setSimulationMode(mode);
    if (mode === 'balancing_active' || mode === 'balancing_passive') {
      setIsAutoBalancing(true);
    } else {
      setIsAutoBalancing(false);
    }
    if (mode !== 'idle') {
      if (!isRunningRef.current) setRunStartElapsed(elapsedRef.current);
      setIsRunning(true);
      setSessionStartedAt((prev) => prev ?? Date.now());
    }
  }, []);

  const reportCtx: ReportContext = useMemo(
    () => ({
      chemistrySpec,
      config,
      cells,
      telemetry,
      logs,
      simulationMode,
      loadProfile,
      seriesCount,
      parallelCount,
      isRunning,
      elapsedMs,
      tickCount,
      sessionStartedAt,
      snapshots,
      electrical,
      energy,
      alarmHistory,
    }),
    [
      chemistrySpec,
      config,
      cells,
      telemetry,
      logs,
      simulationMode,
      loadProfile,
      seriesCount,
      parallelCount,
      isRunning,
      elapsedMs,
      tickCount,
      sessionStartedAt,
      snapshots,
      electrical,
      alarmHistory,
      energy,
    ]
  );

  const reportCtxRef = useRef<ReportContext>(reportCtx);
  reportCtxRef.current = reportCtx;

  const handleStop = useCallback(() => {
    setIsRunning(false);
    addLog('info', 'Simulation stopped. Report view generates from the state at the moment you open it.');
    setIsRealtimeReportOpen(true);
  }, [addLog]);


  // Build a report from the CURRENT state at the exact moment it is requested.
  const generateReport = useCallback(() => createStoredReport(reportCtxRef.current), []);

  const handleViewReport = useCallback(() => {
    playCellClickSound(760);
    setIsRealtimeReportOpen(true);
  }, []);

  const handleDownloadReportCsv = useCallback(() => {
    // Download FIRST (keeps the click gesture), sound after
    const name = downloadPackCsv(reportCtxRef.current);
    playCellClickSound(820);
    return name;
  }, []);

  const handleDownloadReportPdf = useCallback(() => {
    // Download FIRST (keeps the click gesture), sound after
    const name = downloadStoredReportPdf(generateReport());
    playCellClickSound(820);
    return name;
  }, [generateReport]);

  // Selected Cell Object
  const selectedCell = useMemo(() => {
    return cells.find((c) => c.id === selectedCellId) || cells[0] || null;
  }, [cells, selectedCellId]);

  const sidebar = (
    <DashboardSidebar
      dashTab={dashTab}
      onChangeTab={(tab) => {
        setDashTab(tab);
        setMobileOptionsOpen(false);
      }}
      onViewReport={handleViewReport}
      onDownloadCsv={handleDownloadReportCsv}
      onDownloadPdf={handleDownloadReportPdf}
      chemistry={chemistry}
      chemistrySpec={chemistrySpec}
      onSelectChemistry={handleSelectChemistry}
      seriesCount={seriesCount}
      parallelCount={parallelCount}
      onUpdateSeriesCount={handleUpdateSeriesCount}
      onUpdateParallelCount={handleUpdateParallelCount}
      simulationMode={simulationMode}
      onChangeMode={handleChangeMode}
      loadProfile={loadProfile}
      onChangeLoadProfile={setLoadProfile}
      config={config}
      onUpdateConfig={handleUpdateConfig}
      viewMode={viewMode}
      onChangeViewMode={setViewMode}
      cells={cells}
      selectedCellId={selectedCellId}
      onSelectCell={setSelectedCellId}
      isRunning={isRunning}
      onRun={handleRun}
      onStop={handleStop}
      elapsedMs={elapsedMs}
      tickCount={tickCount}
      isAutoBalancing={isAutoBalancing}
      onAutoBalance={handleAutoBalance}
      onRandomizeImbalance={handleRandomizeImbalance}
      onResetPack={handleResetPack}
      onOpenReports={handleViewReport}
      onOpenWizard={() => setIsWizardOpen(true)}
    />
  );

  return (
    <div className="h-screen overflow-hidden bg-[#050a14] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      <Header
        cellTypeLabel={`${chemistrySpec.name} ${chemistrySpec.nominalVoltage.toFixed(2)} V`}
        topology={`${seriesCount}S${parallelCount}P`}
        simulationMode={simulationMode}
        contactor={electrical.contactor}
        onOpenHome={() => setIsWizardOpen(true)}
        onOpenLogs={() => setIsLogsOpen(true)}
        unreadLogCount={logs.filter((l) => l.type === 'fault' || l.type === 'warning').length}
        lastSavedAt={lastSavedAt}
        isRunning={isRunning}
        onRun={handleRun}
        onStop={handleStop}
        onOpenReports={handleViewReport}
      />

      {/* Offline banner: previous data restored */}
      {restoredInfo && (
        <div className="shrink-0 border-b border-slate-800 bg-emerald-950/40">
          <div className="px-4 sm:px-5 py-1.5 flex flex-wrap items-center gap-2 text-[11px] font-mono">
            <HardDriveDownload className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-emerald-300 font-bold">OFFLINE</span>
            <span className="text-slate-300">
              Previous data restored — {restoredInfo.cells} cells, saved {new Date(restoredInfo.savedAt).toLocaleString()}
            </span>
            <button
              onClick={discardPreviousData}
              title="Clear previous data and start from a fresh stack"
              className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
            >
              <Trash2 className="w-3 h-3" /> Clear previous data
            </button>
          </div>
        </div>
      )}

      <div className="shrink-0 border-b border-slate-800 bg-[#081022]">
        <div className="px-4 sm:px-5 py-1.5 flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span className="text-slate-500">REPORTS</span>
          <button
            onClick={handleViewReport}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-700 text-white font-bold cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" /> View report
          </button>
          <button
            onClick={handleDownloadReportCsv}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-700 text-white font-bold cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={handleDownloadReportPdf}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-700 text-white font-bold cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
          <span className="ml-auto text-slate-500">
            Generated live from the pack state at the moment you click
          </span>
        </div>
      </div>

      {mobileOptionsOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-[320px] bg-[#080d18] border-r border-slate-800 overflow-y-auto h-full">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
              <span className="text-xs font-bold text-white">Control panel</span>
              <button onClick={() => setMobileOptionsOpen(false)} className="p-1 text-slate-400 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            {sidebar}
          </div>
          <div className="flex-1 bg-black/60" onClick={() => setMobileOptionsOpen(false)} />
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className="hidden md:flex w-[320px] shrink-0 flex-col border-r border-slate-800 overflow-y-auto">
          {sidebar}
        </aside>

        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="shrink-0 border-b border-slate-800/80 bg-[#050a14]">
            <div className="px-4 sm:px-5 py-2 space-y-2">
              <div className="flex items-center gap-2 md:hidden">
                <button
                  onClick={() => setMobileOptionsOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-xs font-bold text-white cursor-pointer"
                >
                  <PanelLeft className="w-3.5 h-3.5" />
                  Controls
                </button>
                <span className="text-[10px] font-mono text-slate-500">
                  {dashTab} · {seriesCount}S{parallelCount}P
                </span>
              </div>
              <KpiStrip
                telemetry={telemetry}
                el={electrical}
                energy={energy}
                cells={cells}
                spec={chemistrySpec}
                topology={`${seriesCount}S${parallelCount}P`}
                onSelectHigh={() => {
                  setSelectedCellId(telemetry.maxVoltageCellId);
                  setDashTab('overview');
                }}
                onSelectLow={() => {
                  setSelectedCellId(telemetry.minVoltageCellId);
                  setDashTab('overview');
                }}
              />
            </div>
          </div>

          <main className="flex-1 overflow-y-auto px-4 sm:px-5 py-4">
            {dashTab === 'overview' && (
              <ElectricalOverview
                cells={cells}
                selectedCellId={selectedCellId}
                onSelectCell={setSelectedCellId}
                telemetry={telemetry}
                el={electrical}
                energy={energy}
                spec={chemistrySpec}
                seriesCount={seriesCount}
                parallelCount={parallelCount}
                snapshots={snapshots}
                logs={logs}
                isRunning={isRunning}
                mode={simulationMode}
                onOpenChannel={() => setDashTab('cell')}
                onDownloadCellCsv={(id) => downloadCellCsv(reportCtxRef.current, id)}
                onDownloadCellPdf={(id) => downloadCellPdf(reportCtx, id)}
              />
            )}

            {dashTab === 'stack' && (
              <StackVisualizer
                cells={cells}
                selectedCellId={selectedCellId}
                onSelectCell={(id) => setSelectedCellId(id)}
                chemistrySpec={chemistrySpec}
                viewMode={viewMode}
                onChangeViewMode={(mode) => setViewMode(mode)}
                simulationMode={simulationMode}
                packVoltage={telemetry.packVoltage}
                packCurrent={telemetry.packCurrent}
                deltaVoltageMv={telemetry.deltaVoltage}
                seriesCount={seriesCount}
                parallelCount={parallelCount}
                onUpdateSeriesCount={handleUpdateSeriesCount}
                onUpdateParallelCount={handleUpdateParallelCount}
                onUpdateCellVoltage={handleUpdateCellVoltage}
                onInjectCellFault={handleInjectCellFault}
                onToggleCellBalance={handleToggleCellBalance}
                onHealCell={handleHealCell}
              />
            )}

            {dashTab === 'waveforms' && (
              <PackWaveforms
                cells={cells}
                seriesCount={seriesCount}
                parallelCount={parallelCount}
                snapshots={snapshots}
                isRunning={isRunning}
              />
            )}

            {dashTab === 'cell' && selectedCell && (
              <CellInspector
                cell={selectedCell}
                chemistrySpec={chemistrySpec}
                simulationMode={simulationMode}
                packAvgVoltage={telemetry.avgVoltage}
                onUpdateCellVoltage={handleUpdateCellVoltage}
                onInjectCellFault={handleInjectCellFault}
                onToggleCellBalance={handleToggleCellBalance}
                onHealCell={handleHealCell}
                onDownloadCellCsv={(id) => downloadCellCsv(reportCtxRef.current, id)}
                onDownloadCellPdf={(id) => downloadCellPdf(reportCtx, id)}
              />
            )}

            {dashTab === 'operate' && (
              <PackControls
                simulationMode={simulationMode}
                onChangeMode={handleChangeMode}
                loadProfile={loadProfile}
                onChangeLoadProfile={(prof) => setLoadProfile(prof)}
                config={config}
                onUpdateConfig={handleUpdateConfig}
                onAutoBalance={handleAutoBalance}
                onRandomizeImbalance={handleRandomizeImbalance}
                onResetPack={handleResetPack}
                chemistrySpec={chemistrySpec}
                isAutoBalancing={isAutoBalancing}
                isRunning={isRunning}
                onRun={handleRun}
                onStop={handleStop}
                onOpenReports={handleViewReport}
              />
            )}
          </main>
        </div>
      </div>

      <footer className="shrink-0 border-t border-slate-800 bg-[#0a1222] py-1.5 px-4 text-[10.5px] text-slate-500 font-mono flex items-center justify-between gap-3">
        <span>e-BMS · Electrical Battery Management System · {seriesCount}S{parallelCount}P · shunt 100 µΩ · fuse {electrical.fuseRatingA} A</span>
        <span className="hidden sm:inline">
          K1 {electrical.k1MainPos ? 'CLOSED' : 'OPEN'} · K2 {electrical.k2MainNeg ? 'CLOSED' : 'OPEN'} · K3 {electrical.k3Precharge ? 'CLOSED' : 'OPEN'} · R_iso {(electrical.isolationKohm / 1000).toFixed(2)} MΩ
        </span>
      </footer>

      {/* Emergency alarm overlay (red hue blink + flashing banner + solution popup, 10 s apart) */}
      <AlarmOverlay
        alarms={activeAlarms}
        currentWarning={currentWarning}
        onApplySolution={applySolution}
        onDefer={deferAlarm}
      />

      <BmsLogsModal
        isOpen={isLogsOpen}
        onClose={() => setIsLogsOpen(false)}
        logs={logs}
        onClearLogs={() => setLogs([])}
        cells={cells}
        telemetry={telemetry}
        chemistrySpec={chemistrySpec}
      />

      <RealtimeReportModal
        isOpen={isRealtimeReportOpen}
        onClose={() => setIsRealtimeReportOpen(false)}
        isRunning={isRunning}
        generate={generateReport}
      />

      <BatterySetupWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        canDismiss={hasSetup}
        currentChemistry={chemistry}
        seriesCount={seriesCount}
        parallelCount={parallelCount}
        onApply={handleApplyCellType}
      />
    </div>
  );
}
