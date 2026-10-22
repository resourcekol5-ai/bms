// Offline persistence: saves the pack state so the app restores previous data
// on reload with no internet. Uses localStorage (always available, even offline).

import type { CellData, SimulationMode, LoadProfile, PackConfig, SessionSnapshot, BatteryChemistryType } from '../types/battery';
import type { AlarmRecord } from './alarmSystem';
import type { EnergyCounters } from './electrical';

const KEY = 'bms.offline.state.v1';

export interface PersistedState {
  version: 1;
  savedAt: number;
  chemistry: BatteryChemistryType;
  cells: CellData[];
  seriesCount: number;
  parallelCount: number;
  config: PackConfig;
  simulationMode: SimulationMode;
  loadProfile: LoadProfile;
  alarmHistory: AlarmRecord[];
  snapshots: SessionSnapshot[];
  energy: EnergyCounters;
  tickCount: number;
  elapsedMs: number;
  hasSetup: boolean;
}

/** Unix ms of the last successful autosave, or null when nothing has been saved. */
export function saveState(state: Omit<PersistedState, 'version' | 'savedAt'>): number | null {
  try {
    const at = Date.now();
    const payload: PersistedState = { ...state, version: 1, savedAt: at };
    localStorage.setItem(KEY, JSON.stringify(payload));
    return at;
  } catch {
    return null; // storage full or blocked — persistence is best-effort
  }
}

export function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed?.version !== 1 || !Array.isArray(parsed.cells) || parsed.cells.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function stampOf(s: PersistedState | null): string {
  return s ? new Date(s.savedAt).toLocaleString() : '';
}
