import React, { useEffect, useState } from 'react';
import { SimulationMode } from '../types/battery';
import { ContactorState } from '../utils/electrical';
import { Volume2, VolumeX, Terminal, Zap, Play, Square, FileText, Home } from 'lucide-react';
import { setSoundEnabled, isSoundEnabled, playCellClickSound } from '../utils/audio';

interface HeaderProps {
  cellTypeLabel: string;
  topology: string;
  simulationMode: SimulationMode;
  contactor: ContactorState;
  onOpenHome: () => void;
  onOpenLogs: () => void;
  unreadLogCount: number;
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
  onOpenReports: () => void;
  /** Unix ms of the last successful autosave, or null if nothing saved yet. */
  lastSavedAt: number | null;
}

export const Header: React.FC<HeaderProps> = ({
  cellTypeLabel,
  topology,
  simulationMode,
  contactor,
  onOpenHome,
  onOpenLogs,
  unreadLogCount,
  isRunning,
  onRun,
  onStop,
  onOpenReports,
  lastSavedAt,
}) => {
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Live offline/online indicator — this is how you know it works without internet.
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  const savedLabel = lastSavedAt
    ? `saved ${new Date(lastSavedAt).toLocaleTimeString()}`
    : 'not saved yet';

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) playCellClickSound(800);
  };

  const hv =
    contactor === 'closed'
      ? { label: 'HV ON', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', dot: 'bg-emerald-400' }
      : contactor === 'precharge'
      ? { label: 'PRECHARGE', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40', dot: 'bg-amber-400 animate-pulse' }
      : contactor === 'tripped'
      ? { label: 'TRIPPED', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40', dot: 'bg-rose-500 animate-pulse' }
      : { label: 'HV OFF', cls: 'bg-slate-800 text-slate-300 border-slate-700', dot: 'bg-slate-500' };

  return (
    <header className="shrink-0 bg-[#0a1222] border-b border-slate-800 z-30">
      <div className="px-4 sm:px-5 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Zap className="w-5 h-5 text-slate-950" fill="currentColor" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-white tracking-tight leading-tight">
              e-BMS <span className="text-slate-400 font-medium">· Electrical Battery Management System</span>
            </h1>
            <p className="text-[10.5px] text-slate-500 font-mono hidden sm:block">
              {topology} string · {cellTypeLabel} · mode {simulationMode.replace(/_/g, ' ')}
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <span
            title={
              online
                ? 'Connected to a network — but the app does not need it. All data is stored locally.'
                : 'Working offline. All data is stored locally in this browser.'
            }
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono font-bold ${
              online
                ? 'bg-slate-800 text-slate-400 border-slate-700'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${online ? 'bg-slate-500' : 'bg-emerald-400'}`} />
            {online ? 'ONLINE' : 'OFFLINE'}
          </span>

          <span
            title={online ? undefined : 'Autosave writes to this browser — no internet needed'}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-slate-700 bg-slate-950 text-[10px] font-mono text-slate-400"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${lastSavedAt ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            {savedLabel}
          </span>

          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono font-bold ${hv.cls}`}>
            <span className={`w-2 h-2 rounded-full ${hv.dot}`} />
            {hv.label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Home Icon Button (Opens starting page / cell setup wizard) */}
          <button
            onClick={() => {
              playCellClickSound(800);
              onOpenHome();
            }}
            title="Home / Open Starting Page"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 border border-slate-700 cursor-pointer transition shadow"
          >
            <Home className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Home</span>
          </button>

          <button
            onClick={() => {
              playCellClickSound(700);
              if (isRunning) onStop();
              else onRun();
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold border cursor-pointer ${
              isRunning
                ? 'bg-rose-600 text-white border-rose-400/40 hover:bg-rose-500'
                : 'bg-emerald-600 text-white border-emerald-400/40 hover:bg-emerald-500'
            }`}
          >
            {isRunning ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span className="hidden sm:inline">{isRunning ? 'Stop' : 'Run'}</span>
          </button>

          <button
            onClick={() => {
              playCellClickSound(720);
              onOpenReports();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 cursor-pointer"
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Reports</span>
          </button>

          <button
            onClick={() => {
              playCellClickSound(650);
              onOpenLogs();
            }}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 cursor-pointer"
          >
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Event log</span>
            {unreadLogCount > 0 && (
              <span className="px-1.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">{unreadLogCount}</span>
            )}
          </button>

          <button
            onClick={toggleSound}
            title={soundOn ? 'Mute' : 'Unmute'}
            className="p-1.5 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 cursor-pointer"
          >
            {soundOn ? <Volume2 className="w-4 h-4 text-cyan-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </div>
    </header>
  );
};
