import React, { useState } from 'react';
import { CellData, BmsTelemetry, ChemistrySpec } from '../types/battery';
import { 
  X, 
  Terminal, 
  AlertTriangle, 
  CheckCircle2, 
  Filter, 
  Trash2,
  FileSpreadsheet
} from 'lucide-react';
import { playCellClickSound } from '../utils/audio';
import { deliverText } from '../utils/fileDelivery';

export interface BmsLogEvent {
  id: string;
  timestamp: string;
  type: 'info' | 'warning' | 'fault' | 'balance';
  cellId?: number;
  message: string;
  voltage?: number;
  temperature?: number;
}

interface BmsLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: BmsLogEvent[];
  onClearLogs: () => void;
  cells: CellData[];
  telemetry: BmsTelemetry;
  chemistrySpec: ChemistrySpec;
}

export const BmsLogsModal: React.FC<BmsLogsModalProps> = ({
  isOpen,
  onClose,
  logs,
  onClearLogs,
  cells,
  telemetry,
  chemistrySpec,
}) => {
  const [filter, setFilter] = useState<'all' | 'warning' | 'fault' | 'balance'>('all');

  if (!isOpen) return null;

  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    return log.type === filter;
  });

  // Export full CSV telemetry (download first so the click gesture is preserved)
  const handleExportCsv = () => {
    const headers = [
      'Timestamp',
      'Cell_ID',
      'Label',
      'Voltage_V',
      'SoC_Percent',
      'Temperature_C',
      'InternalResistance_mOhm',
      'CapacityRemaining_mAh',
      'CapacityNominal_mAh',
      'Cycles',
      'IsBalancing',
      'Status',
      'FaultType'
    ];

    const timestamp = new Date().toISOString();
    const rows = cells.map((c) => [
      timestamp,
      c.id,
      `"${c.label}"`,
      c.voltage.toFixed(3),
      c.soc.toFixed(1),
      c.temperature.toFixed(1),
      c.internalResistance.toFixed(2),
      c.capacityRemaining,
      c.capacityNominal,
      c.cycles,
      c.isBalancing ? 'TRUE' : 'FALSE',
      c.status,
      c.faultType
    ]);

    const csv = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    deliverText(csv, `bms_telemetry_${chemistrySpec.id}_${Date.now()}.csv`, 'text/csv');
    playCellClickSound(700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col justify-between">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-md p-6 border-b border-slate-800 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">
                BMS Diagnostics, DTC Scanner & Telemetry Logs
              </h2>
              <p className="text-xs text-slate-400">
                Live CAN-bus frame logger, hardware fault codes & CSV raw data export.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Active Diagnostic Trouble Codes (DTC) Box */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-300 font-mono flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>SAE J1939 / OBD-II DIAGNOSTIC TROUBLE CODES (DTC):</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">CAN ID: 0x1838F380</span>
            </div>

            <div className="space-y-2 text-xs font-mono">
              {telemetry.deltaVoltage > 50 && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start justify-between">
                  <div>
                    <span className="font-bold text-amber-400">[DTC P0AC4] — CELL VOLTAGE IMBALANCE EXCEEDED</span>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Delta ΔV is {telemetry.deltaVoltage.toFixed(1)}mV (Threshold 50mV). BMS recommends automatic active balancing cycle.
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">ACTIVE</span>
                </div>
              )}

              {telemetry.maxTemperature > chemistrySpec.tempMax && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-start justify-between">
                  <div>
                    <span className="font-bold text-rose-400">[DTC P0A7E] — BATTERY PACK OVER-TEMPERATURE</span>
                    <p className="text-[11px] text-slate-300 mt-0.5">
                      Cell #{telemetry.maxTempCellId} reached {telemetry.maxTemperature.toFixed(1)}°C (Limit {chemistrySpec.tempMax}°C). Cooling fan commanded to 100%.
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px]">CRITICAL</span>
                </div>
              )}

              {telemetry.deltaVoltage <= 50 && telemetry.maxTemperature <= chemistrySpec.tempMax && (
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>NO STORED DTC FAULTS — ALL SYSTEM HEALTH REGISTERS NOMINAL (0x0000)</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">PASSED</span>
                </div>
              )}
            </div>
          </div>

          {/* Event Stream Filter & Table */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300 font-mono">
                  LIVE BMS EVENT CHRONICLE ({filteredLogs.length} Events):
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Filters */}
                <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                  <Filter className="w-3.5 h-3.5 text-slate-500 ml-1" />
                  {(['all', 'warning', 'fault', 'balance'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono capitalize transition cursor-pointer ${
                        filter === f ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                <button
                  onClick={onClearLogs}
                  className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition cursor-pointer"
                  title="Clear log history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Log Stream Container */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3 max-h-72 overflow-y-auto space-y-1.5 font-mono text-xs">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No event records found matching current filter.
                </div>
              ) : (
                filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-2 rounded bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-2 hover:bg-slate-900 transition"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 shrink-0">{log.timestamp}</span>
                      <span
                        className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase shrink-0 ${
                          log.type === 'fault'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : log.type === 'warning'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : log.type === 'balance'
                            ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {log.type}
                      </span>
                      {log.cellId && (
                        <span className="text-slate-400 font-bold shrink-0">C#{log.cellId}</span>
                      )}
                      <span className="text-slate-200 line-clamp-1">{log.message}</span>
                    </div>

                    {log.voltage !== undefined && (
                      <span className="text-[11px] text-cyan-400 font-bold shrink-0">
                        {log.voltage.toFixed(3)}V
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-slate-900/95 backdrop-blur-md p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>AFE Protocol: Texas Instruments BQ76952 & Analog Devices LTC6813 Emulated</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 transition cursor-pointer"
          >
            Close Logs
          </button>
        </div>
      </div>
    </div>
  );
};
