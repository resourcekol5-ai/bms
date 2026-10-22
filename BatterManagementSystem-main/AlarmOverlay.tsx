import { Siren, ShieldAlert, X, Zap, Power, Clock, ArrowRight, Wrench, AlertOctagon, BookOpen, ClipboardCheck } from 'lucide-react';
import { Alarm, AlarmSolution } from '../utils/alarmSystem';

interface AlarmOverlayProps {
  /** Every threat currently active — drives the red hue blink + banner */
  alarms: Alarm[];
  /** The warning currently being presented */
  currentWarning: Alarm | null;
  onApplySolution: (alarm: Alarm, solution: AlarmSolution) => void;
  onDefer: (alarm: Alarm) => void;
}

const LETTERS = ['A', 'B', 'C'] as const;

function SolutionOption({ solution, index, onChoose }: { solution: AlarmSolution; index: 0 | 1 | 2; onChoose: () => void }) {
  const style =
    solution.tier === 'auto'
      ? {
          ring: 'border-cyan-500/60 bg-cyan-950/30 hover:bg-cyan-950/60 hover:shadow-[0_0_24px_rgba(6,182,212,0.3)]',
          badge: 'bg-cyan-400 text-slate-950',
          arrow: 'text-cyan-300',
          icon: <Zap className="w-2.5 h-2.5" />,
        }
      : solution.tier === 'trip'
      ? {
          ring: 'border-rose-500/70 bg-rose-950/30 hover:bg-rose-950/60 hover:shadow-[0_0_24px_rgba(244,63,94,0.3)]',
          badge: 'bg-rose-400 text-slate-950',
          arrow: 'text-rose-300',
          icon: <Power className="w-2.5 h-2.5" />,
        }
      : {
          ring: 'border-violet-500/60 bg-violet-950/30 hover:bg-violet-950/60 hover:shadow-[0_0_24px_rgba(139,92,246,0.3)]',
          badge: 'bg-violet-400 text-slate-950',
          arrow: 'text-violet-300',
          icon: <ClipboardCheck className="w-2.5 h-2.5" />,
        };
  return (
    <button
      onClick={onChoose}
      className={`group relative text-left rounded-xl border-2 p-3.5 transition-all cursor-pointer hover:-translate-y-0.5 ${style.ring}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex items-center gap-1 text-[9px] font-black font-mono px-2 py-0.5 rounded tracking-widest ${style.badge}`}>
          {style.icon}
          {LETTERS[index]} · {solution.code} {solution.action}
        </span>
        <ArrowRight className={`w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity ${style.arrow}`} />
      </div>
      <div className="text-white font-bold text-sm leading-snug">{solution.label}</div>
      <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">{solution.description}</p>
    </button>
  );
}

/** Horizontal gauge: marker at the pre-alarm threshold (0.85) and at the protection limit (1.0). */
function LimitGauge({ ratio, critical }: { ratio: number; critical: boolean }) {
  const pos = Math.max(0, Math.min(1, (ratio - 0.7) / 0.6)); // 0.70 → 1.30
  const warnX = ((0.85 - 0.7) / 0.6) * 100;
  const limitX = ((1.0 - 0.7) / 0.6) * 100;
  return (
    <div className="mt-3">
      <div className="relative h-3 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${critical ? 'bg-gradient-to-r from-amber-500 to-red-500' : 'bg-gradient-to-r from-emerald-500 to-amber-400'}`}
          style={{ width: `${pos * 100}%` }}
        />
        <div className="absolute inset-y-0 w-px bg-amber-300" style={{ left: `${warnX}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-red-400" style={{ left: `${limitX}%` }} />
      </div>
      <div className="relative h-4 mt-1 text-[9px] font-mono text-slate-500">
        <span className="absolute -translate-x-1/2 text-amber-300/80" style={{ left: `${warnX}%` }}>pre-alarm</span>
        <span className="absolute -translate-x-1/2 text-red-300/90" style={{ left: `${limitX}%` }}>limit</span>
        <span className="absolute right-0 text-slate-600">trip →</span>
      </div>
    </div>
  );
}

export function AlarmOverlay({ alarms, currentWarning, onApplySolution, onDefer }: AlarmOverlayProps) {
  if (alarms.length === 0) return null;
  const worst = alarms[0];
  const anyCritical = alarms.some((a) => a.severity === 'critical');
  const w = currentWarning;
  const wCritical = w?.severity === 'critical';
  const others = w ? alarms.filter((a) => a.key !== w.key) : [];

  return (
    <>
      {/* Dim layer under the red hue so the hue stays visible around the card */}
      {w && <div className="fixed inset-0 z-[93] bg-black/55 pointer-events-none" aria-hidden />}

      {/* ── Blinking red hue over the whole screen ── */}
      <div className="fixed inset-0 z-[94] pointer-events-none" aria-hidden>
        <div className={`absolute inset-0 ${anyCritical ? 'alarm-red-tint' : 'alarm-red-tint-soft'}`} />
        <div
          className="absolute inset-0 alarm-flash"
          style={{ background: 'radial-gradient(ellipse at center, rgba(220,38,38,0) 36%, rgba(220,38,38,0.6) 100%)' }}
        />
        <div
          className="absolute inset-0 alarm-flash-fast"
          style={{ boxShadow: 'inset 0 0 0 10px rgba(239,68,68,0.9), inset 0 0 110px rgba(220,38,38,0.55)' }}
        />
      </div>

      {/* ── Blinking banner (visual only) ── */}
      <div className="fixed top-0 inset-x-0 z-[96] pointer-events-none">
        <div className="banner-flash flex items-center justify-center gap-3 px-4 py-2.5 text-white shadow-[0_8px_30px_rgba(190,18,60,0.55)]">
          <span className="relative flex w-6 h-6 items-center justify-center shrink-0">
            <span className="absolute inline-flex w-full h-full rounded-full bg-white/30 alarm-flash-fast" />
            <Siren className="w-5 h-5 relative animate-spin" style={{ animationDuration: '1.6s' }} />
          </span>
          <span className="text-sm sm:text-base font-black tracking-widest font-mono truncate">
            {alarms.length > 1 ? `⚠ ${alarms.length} ACTIVE FAULTS` : '⚠ FAULT'} — {worst.title}
          </span>
          <span className="text-[10px] font-mono text-white/80 hidden md:inline">
            {worst.measured} / {worst.limit}
          </span>
        </div>
      </div>

      {/* ── Fault panel ── */}
      {w && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl my-auto rounded-2xl overflow-hidden border-2 border-red-500 bg-[#110507] shadow-[0_0_90px_rgba(239,68,68,0.5)] alarm-modal-in">
            {/* Header */}
            <div className="banner-flash flex items-center gap-3 px-5 py-4">
              <div className="relative shrink-0">
                <span className="absolute inset-0 rounded-full bg-red-500/40 alarm-flash-fast" />
                <span className="relative grid w-12 h-12 place-items-center rounded-full bg-red-950 border-2 border-red-500">
                  {wCritical ? <AlertOctagon className="w-6 h-6 text-red-400" /> : <ShieldAlert className="w-6 h-6 text-amber-300" />}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-[10px] font-black font-mono px-2 py-0.5 rounded tracking-widest ${
                      wCritical ? 'bg-red-500 text-white' : 'bg-amber-400 text-slate-950'
                    }`}
                  >
                    {wCritical ? 'TRIP LEVEL' : 'PRE-ALARM'}
                  </span>
                  <span className="text-[10px] font-mono text-white/70 tracking-widest">BMS PROTECTION SYSTEM</span>
                  {w.cellId && (
                    <span className="text-[10px] font-mono text-white/70 tracking-widest">· CELL #{w.cellId}</span>
                  )}
                </div>
                <h2 className="text-white font-black tracking-wide text-lg mt-1 leading-tight">{w.title}</h2>
              </div>
              <button
                onClick={() => onDefer(w)}
                title="Acknowledge — keep running; the alarm re-alerts automatically if the fault persists"
                className="ml-auto p-1.5 rounded-lg bg-white/10 hover:bg-white/25 text-white/90 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* What is wrong */}
              <div>
                <div className="text-[10px] font-black font-mono text-red-300 tracking-widest mb-1.5">PROBLEM DETECTED</div>
                <p className="text-sm text-slate-200 leading-relaxed">{w.detail}</p>
              </div>

              {/* Measured vs limit with gauge */}
              <div className="rounded-xl border border-red-500/40 bg-red-950/25 p-4">
                <div className="flex items-end justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Measured now</div>
                    <div className="text-3xl font-black font-mono text-white leading-tight">{w.measured}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-mono text-red-300/80 uppercase tracking-widest">Protection limit</div>
                    <div className="text-xl font-black font-mono text-red-300 leading-tight">{w.limit}</div>
                  </div>
                </div>
                <LimitGauge ratio={w.ratio} critical={wCritical} />
              </div>

              {/* Cause / risk / standard */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-black font-mono text-cyan-300 tracking-widest mb-1.5">
                    <Wrench className="w-3 h-3" /> LIKELY CAUSE
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{w.cause}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-black font-mono text-red-300 tracking-widest mb-1.5">
                    <AlertOctagon className="w-3 h-3" /> RISK IF IGNORED
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{w.risk}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-black font-mono text-violet-300 tracking-widest mb-1.5">
                    <BookOpen className="w-3 h-3" /> STANDARD
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{w.standard}</p>
                </div>
              </div>

              {/* Corrective actions */}
              <div>
                <div className="text-[10px] font-black font-mono text-emerald-300 tracking-widest mb-2">
                  CORRECTIVE ACTIONS FOR THIS FAULT — SELECT ONE TO APPLY
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {w.solutions.map((s, i) => (
                    <SolutionOption key={s.id} solution={s} index={i as 0 | 1 | 2} onChoose={() => onApplySolution(w, s)} />
                  ))}
                </div>
              </div>

              {/* Other active faults */}
              {others.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono">
                  <span className="text-slate-500">ALSO ACTIVE:</span>
                  {others.map((a) => (
                    <span
                      key={a.key}
                      className={`px-2 py-0.5 rounded border ${
                        a.severity === 'critical' ? 'border-red-500/60 text-red-300 bg-red-950/40' : 'border-amber-500/50 text-amber-300 bg-amber-950/30'
                      }`}
                    >
                      {a.title.split(' — ')[0]} · {a.measured}
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={() => onDefer(w)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-bold text-xs cursor-pointer border border-slate-800"
              >
                <Clock className="w-3.5 h-3.5" /> Acknowledge &amp; keep running — re-alerts automatically while the fault persists
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
