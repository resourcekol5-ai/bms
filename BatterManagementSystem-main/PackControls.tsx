import React from 'react';
import { SimulationMode, LoadProfile, PackConfig, ChemistrySpec } from '../types/battery';
import { LOAD_PROFILES } from '../data/batteryChemistryData';
import { 
  Pause, 
  Zap, 
  BatteryCharging, 
  RotateCcw, 
  Fan, 
  Thermometer, 
  Gauge, 
  Sparkles, 
  FastForward, 
  Shuffle, 
  RefreshCw,
  Car,
  Radio,
  Flame,
  Sun,
  Sliders,
  Play,
  Square,
  FileText
} from 'lucide-react';
import { playCellClickSound, playRelayClickSound } from '../utils/audio';

interface PackControlsProps {
  simulationMode: SimulationMode;
  onChangeMode: (mode: SimulationMode) => void;
  loadProfile: LoadProfile;
  onChangeLoadProfile: (profile: LoadProfile) => void;
  config: PackConfig;
  onUpdateConfig: (partial: Partial<PackConfig>) => void;
  onAutoBalance: () => void;
  onRandomizeImbalance: () => void;
  onResetPack: () => void;
  chemistrySpec: ChemistrySpec;
  isAutoBalancing: boolean;
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
  onOpenReports: () => void;
}

export const PackControls: React.FC<PackControlsProps> = ({
  simulationMode,
  onChangeMode,
  loadProfile,
  onChangeLoadProfile,
  config,
  onUpdateConfig,
  onAutoBalance,
  onRandomizeImbalance,
  onResetPack,
  chemistrySpec,
  isAutoBalancing,
  isRunning,
  onRun,
  onStop,
  onOpenReports,
}) => {
  const getProfileIcon = (iconName: string) => {
    switch (iconName) {
      case 'Car': return <Car className="w-4 h-4 text-cyan-400" />;
      case 'Zap': return <Zap className="w-4 h-4 text-amber-400" />;
      case 'Radio': return <Radio className="w-4 h-4 text-pink-400" />;
      case 'Flame': return <Flame className="w-4 h-4 text-rose-400" />;
      case 'Sun': return <Sun className="w-4 h-4 text-yellow-400" />;
      case 'BatteryCharging': return <BatteryCharging className="w-4 h-4 text-emerald-400" />;
      case 'RefreshCw': return <RefreshCw className="w-4 h-4 text-blue-400" />;
      default: return <Sliders className="w-4 h-4 text-indigo-400" />;
    }
  };

  const simModes: { id: SimulationMode; label: string; icon: React.ReactNode; desc: string; color: string }[] = [
    {
      id: 'charging_cccv',
      label: 'Charge (CC/CV)',
      icon: <BatteryCharging className="w-4 h-4 text-emerald-400" />,
      desc: 'Constant Current / Constant Voltage Charging',
      color: 'from-emerald-600 to-teal-700',
    },
    {
      id: 'discharging_load',
      label: 'Discharge Load',
      icon: <Zap className="w-4 h-4 text-amber-400" />,
      desc: 'Simulate active powertrain/drone/ESS load draw',
      color: 'from-amber-600 to-orange-700',
    },
    {
      id: 'balancing_active',
      label: 'Active Balance',
      icon: <Sparkles className="w-4 h-4 text-cyan-400" />,
      desc: 'Inductive/capacitive energy transfer between cells',
      color: 'from-cyan-600 to-blue-700',
    },
    {
      id: 'balancing_passive',
      label: 'Passive Balance',
      icon: <RefreshCw className="w-4 h-4 text-indigo-400" />,
      desc: 'Dissipate excess voltage via shunt resistors',
      color: 'from-indigo-600 to-purple-700',
    },
    {
      id: 'stress_test',
      label: 'Overload Stress Test',
      icon: <Flame className="w-4 h-4 text-rose-400" />,
      desc: 'Ramps load 50→130% of rated current to exercise protection alarms',
      color: 'from-rose-700 to-red-800',
    },
    {
      id: 'idle',
      label: 'Idle / Standby',
      icon: <Pause className="w-4 h-4 text-slate-400" />,
      desc: 'Resting state with thermal relaxation',
      color: 'from-slate-700 to-slate-800',
    },
  ];

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-2xl backdrop-blur-md space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-wide">
              BMS Master Operating Controls & Simulation Engine
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Control charge/discharge states, apply real-world load profiles, and trigger active pack balancing.
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              playRelayClickSound('close');
              onRun();
            }}
            disabled={isRunning}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
              isRunning
                ? 'bg-emerald-500/10 text-emerald-400/50 border-emerald-500/20 cursor-not-allowed'
                : 'bg-emerald-600 text-white border-emerald-400/40 hover:bg-emerald-500'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            Run
          </button>

          <button
            onClick={() => {
              playRelayClickSound('open');
              onStop();
            }}
            disabled={!isRunning}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
              !isRunning
                ? 'bg-rose-500/10 text-rose-400/50 border-rose-500/20 cursor-not-allowed'
                : 'bg-rose-600 text-white border-rose-400/40 hover:bg-rose-500'
            }`}
          >
            <Square className="w-3 h-3 fill-current" />
            Stop
          </button>

          <button
            onClick={() => {
              playCellClickSound(700);
              onOpenReports();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white border border-indigo-400/30 hover:bg-indigo-500 transition cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            Reports
          </button>

          {/* Auto Balance Button */}
          <button
            onClick={() => {
              playRelayClickSound('close');
              onAutoBalance();
            }}
            disabled={isAutoBalancing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-lg cursor-pointer border ${
              isAutoBalancing
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse'
                : 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white border-cyan-400/30 hover:brightness-110'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 ${isAutoBalancing ? 'animate-spin' : ''}`} />
            <span>{isAutoBalancing ? 'Balancing In Progress...' : '1-Click Auto-Balance'}</span>
          </button>

          {/* Randomize Imbalance */}
          <button
            onClick={() => {
              playCellClickSound(550);
              onRandomizeImbalance();
            }}
            title="Introduce realistic cell variations"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition border border-slate-700 cursor-pointer"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Add Imbalance</span>
          </button>

          {/* Reset Pack */}
          <button
            onClick={() => {
              playRelayClickSound('open');
              onResetPack();
            }}
            title="Reset all cells to nominal state"
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition border border-slate-700 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 1. Operating Modes Selection Grid */}
      <div>
        <label className="text-xs font-mono font-bold text-slate-300 block mb-2">
          MASTER BMS OPERATING MODE:
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {simModes.map((mode) => {
            const isSelected = simulationMode === mode.id;

            return (
              <button
                key={mode.id}
                onClick={() => {
                  playRelayClickSound('close');
                  onChangeMode(mode.id);
                }}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? `bg-gradient-to-br ${mode.color} text-white border-white/40 shadow-lg scale-102 font-semibold`
                    : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="p-1 rounded-lg bg-black/30">
                    {mode.icon}
                  </span>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  )}
                </div>
                <div>
                  <span className={`text-xs font-bold block ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                    {mode.label}
                  </span>
                  <span className="text-[10px] text-slate-400 block line-clamp-1 mt-0.5">
                    {mode.desc}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Load Profiles Selector (When in Discharging or Custom Load) */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs font-mono font-bold text-slate-300 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>REAL-WORLD LOAD SCENARIOS & APPLICATION PRESETS:</span>
          </label>
          <span className="text-[11px] font-mono text-slate-400">
            Presets automatically adjust discharge current & thermal load
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(LOAD_PROFILES).map(([key, profile]) => {
            const isSelected = loadProfile === key;

            return (
              <button
                key={key}
                onClick={() => {
                  playCellClickSound(620);
                  onChangeLoadProfile(key as LoadProfile);
                  onUpdateConfig({ loadCurrent: profile.current });
                  if (simulationMode === 'idle') {
                    onChangeMode(key.includes('charge') ? 'charging_cccv' : 'discharging_load');
                  }
                }}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-200 font-semibold shadow-md'
                    : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    {getProfileIcon(profile.icon)}
                    <span className="text-xs font-bold text-slate-200 line-clamp-1">{profile.name}</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-amber-400">
                    {profile.current}A
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 line-clamp-2 mt-1">
                  {profile.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Sliders: Current, Ambient Temp, Active Cooling & Speed Multiplier */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-950/80 border border-slate-800 rounded-xl p-4">
        {/* Slider 1: Current Slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-slate-400 flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Target Current:</span>
            </span>
            <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
              {simulationMode === 'charging_cccv' ? `+${config.chargeCurrent}A (Charge)` : `-${config.loadCurrent}A (Draw)`}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={60}
            step={0.5}
            value={simulationMode === 'charging_cccv' ? config.chargeCurrent : config.loadCurrent}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (simulationMode === 'charging_cccv') {
                onUpdateConfig({ chargeCurrent: val });
              } else {
                onUpdateConfig({ loadCurrent: val });
              }
            }}
            className="w-full accent-amber-400 bg-slate-800 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>1.0 A (Gentle)</span>
            <span>Max Rating: {chemistrySpec.maxDischargeC}C</span>
            <span>60.0 A (Heavy Load)</span>
          </div>
        </div>

        {/* Slider 2: Ambient Temperature */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-slate-400 flex items-center gap-1">
              <Thermometer className="w-3.5 h-3.5 text-rose-400" />
              <span>Ambient Temp:</span>
            </span>
            <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
              {config.ambientTemp}°C ({((config.ambientTemp * 9/5) + 32).toFixed(0)}°F)
            </span>
          </div>
          <input
            type="range"
            min={-20}
            max={50}
            step={1}
            value={config.ambientTemp}
            onChange={(e) => onUpdateConfig({ ambientTemp: parseInt(e.target.value, 10) })}
            className="w-full accent-rose-400 bg-slate-800 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>-20°C (Freezing)</span>
            <span>+50°C (Extreme Heat)</span>
          </div>
        </div>

        {/* Control 3: Active Cooling Fan Toggle */}
        <div className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 flex items-center gap-1">
              <Fan className={`w-3.5 h-3.5 ${config.activeCooling ? 'text-cyan-400 animate-spin' : 'text-slate-500'}`} />
              <span>Thermal Cooling:</span>
            </span>
            <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
              config.activeCooling ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'bg-slate-800 text-slate-400'
            }`}>
              {config.activeCooling ? 'ACTIVE (3500 RPM)' : 'DISABLED'}
            </span>
          </div>
          <button
            onClick={() => {
              playCellClickSound(config.activeCooling ? 400 : 800);
              onUpdateConfig({ activeCooling: !config.activeCooling });
            }}
            className={`mt-2 py-2 px-3 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition cursor-pointer border ${
              config.activeCooling
                ? 'bg-cyan-600 text-white border-cyan-400 shadow-md'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Fan className={`w-4 h-4 ${config.activeCooling ? 'animate-spin' : ''}`} />
            <span>{config.activeCooling ? 'Fan Cooling [ON]' : 'Turn On Cooling Fan'}</span>
          </button>
        </div>

        {/* Control 4: Simulation Speed Multiplier */}
        <div className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 flex items-center gap-1">
              <FastForward className="w-3.5 h-3.5 text-indigo-400" />
              <span>Sim Time Multiplier:</span>
            </span>
            <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded text-[11px]">
              {config.simulationSpeed}x Speed
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 mt-2">
            {[1, 2, 5, 10].map((spd) => (
              <button
                key={spd}
                onClick={() => {
                  playCellClickSound(500 + spd * 50);
                  onUpdateConfig({ simulationSpeed: spd });
                }}
                className={`py-1.5 rounded text-xs font-mono font-bold transition cursor-pointer ${
                  config.simulationSpeed === spd
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
