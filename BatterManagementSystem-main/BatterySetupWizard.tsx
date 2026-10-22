import { useState } from 'react';
import { X, Check, Zap, Thermometer, RefreshCw, ShieldCheck, Gauge, Layers } from 'lucide-react';
import { BatteryChemistryType } from '../types/battery';
import { BATTERY_CHEMISTRIES } from '../data/batteryChemistryData';
import { playCellClickSound } from '../utils/audio';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  canDismiss: boolean;
  currentChemistry: BatteryChemistryType;
  seriesCount: number;
  parallelCount: number;
  onApply: (chemistry: BatteryChemistryType) => void;
}

export function BatterySetupWizard({
  isOpen,
  onClose,
  canDismiss,
  currentChemistry,
  seriesCount,
  parallelCount,
  onApply,
}: Props) {
  const [chemistry, setChemistry] = useState<BatteryChemistryType>(currentChemistry);
  const types = Object.values(BATTERY_CHEMISTRIES);
  const spec = BATTERY_CHEMISTRIES[chemistry];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-[#050a14]/97 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 md:p-6">
        <div className="w-full max-w-5xl bg-[#080f1e] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-slate-800 bg-[#0b1526] flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-400 font-bold">e-BMS setup</div>
              <h2 className="text-lg font-bold text-white">Select cell type</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Sets the cell voltage window, capacity and internal resistance for the {seriesCount}S{parallelCount}P string.
              </p>
            </div>
            {canDismiss && (
              <button onClick={onClose} className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Cell type grid */}
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {types.map((chem) => {
              const active = chem.id === chemistry;
              return (
                <button
                  key={chem.id}
                  onClick={() => {
                    playCellClickSound(640);
                    setChemistry(chem.id);
                  }}
                  className={`text-left p-3 rounded-xl border transition cursor-pointer ${
                    active ? 'bg-cyan-500/10 border-cyan-400 ring-1 ring-cyan-500/30' : 'bg-[#0b1526] border-slate-800 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white">{chem.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{chem.formFactorName.split('(')[0].trim()}</div>
                    </div>
                    <span
                      className={`w-4 h-4 rounded-full border grid place-items-center shrink-0 mt-0.5 ${
                        active ? 'bg-cyan-500 border-cyan-400' : 'border-slate-600'
                      }`}
                    >
                      {active && <Check className="w-2.5 h-2.5 text-slate-950" />}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 mt-2.5 font-mono text-[10px]">
                    {[
                      [<Zap key="v" className="w-3 h-3 text-cyan-400" />, 'Nominal', `${chem.nominalVoltage.toFixed(2)} V`],
                      [<Layers key="w" className="w-3 h-3 text-slate-400" />, 'Window', `${chem.cutoffVoltage.toFixed(2)}–${chem.maxVoltage.toFixed(2)} V`],
                      [<Gauge key="c" className="w-3 h-3 text-amber-400" />, 'Capacity', `${(chem.typicalCapacity / 1000).toFixed(1)} Ah`],
                      [<RefreshCw key="r" className="w-3 h-3 text-violet-400" />, 'Resistance', `${chem.typicalIR} mΩ`],
                      [<Zap key="d" className="w-3 h-3 text-rose-400" />, 'Max rate', `${chem.maxDischargeC} C`],
                      [<Thermometer key="t" className="w-3 h-3 text-orange-400" />, 'Temp', `${chem.tempMin}…${chem.tempMax} °C`],
                    ].map(([icon, k, v]) => (
                      <div key={k as string} className="rounded-md border border-slate-800 bg-[#060c18] px-2 py-1 flex items-center gap-1.5 min-w-0">
                        {icon as React.ReactNode}
                        <span className="text-slate-500 truncate">{k as string}</span>
                        <span className="text-slate-100 font-bold ml-auto shrink-0">{v as string}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-800 flex items-center gap-2 text-[9.5px] font-mono">
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <ShieldCheck className="w-3 h-3" /> {chem.safetyRating}
                    </span>
                    <span className="text-slate-500">{chem.cycleLife.toLocaleString()} cycles</span>
                    <span className="text-slate-500 ml-auto">{chem.energyDensity} Wh/kg</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Summary + actions */}
          <div className="px-5 py-3 border-t border-slate-800 bg-[#0b1526]">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 font-mono text-[11px] mb-3">
              {[
                ['Cell type', spec.name],
                ['String', `${seriesCount}S${parallelCount}P`],
                ['Pack nominal', `${(spec.nominalVoltage * seriesCount).toFixed(1)} V`],
                ['Pack window', `${(spec.cutoffVoltage * seriesCount).toFixed(1)}–${(spec.maxVoltage * seriesCount).toFixed(1)} V`],
                ['Cells', `${seriesCount * parallelCount}`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-md border border-slate-800 bg-[#060c18] px-2 py-1.5 min-w-0">
                  <div className="text-[9px] text-slate-500">{k}</div>
                  <div className="text-slate-100 font-bold truncate">{v}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2">
              {canDismiss && (
                <button onClick={onClose} className="px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white cursor-pointer">
                  Cancel
                </button>
              )}
              <button
                onClick={() => {
                  playCellClickSound(880);
                  onApply(chemistry);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 cursor-pointer"
              >
                <Check className="w-4 h-4" /> Use {spec.name} cells
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
