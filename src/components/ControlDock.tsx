import React from 'react';
import {
  Building2,
  Camera,
  ChevronDown,
  ChevronUp,
  CloudRain,
  Compass,
  RotateCcw,
  Trees,
  Wrench,
} from 'lucide-react';
import { CameraPresetId, SimulationParams } from '../data/floodCurriculum';
import { ViewMode } from './UrbanFloodViewport';

interface ControlDockProps {
  params: SimulationParams;
  onChangeParams: (next: SimulationParams) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  cameraPreset: CameraPresetId;
  onSelectCameraPreset: (preset: CameraPresetId) => void;
  viewMode: ViewMode;
  arScale: number;
  onChangeArScale: (scale: number) => void;
  onRecenterAr: () => void;
}

const CAMERA_OPTIONS: { id: CameraPresetId; label: string }[] = [
  { id: 'overview', label: 'Keseluruhan' },
  { id: 'drainage', label: 'Parit & Larian' },
  { id: 'river', label: 'Sungai & Banjir' },
  { id: 'mitigation', label: 'Taman Hujan' },
];

export const ControlDock: React.FC<ControlDockProps> = ({
  params,
  onChangeParams,
  collapsed,
  onToggleCollapse,
  cameraPreset,
  onSelectCameraPreset,
  viewMode,
  arScale,
  onChangeArScale,
  onRecenterAr,
}) => {
  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 w-[min(920px,95vw)] pointer-events-none flex flex-col items-center">
      {/* Collapse / Expand Handle */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-1 rounded-t-lg bg-slate-950/95 border border-b-0 border-slate-700/80 text-xs font-medium text-slate-200 hover:text-white hover:bg-slate-900 transition-colors shadow-lg whitespace-nowrap"
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
            <span>Buka Kawalan Simulasi</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5 text-sky-400" />
            <span>Tutup Kawalan</span>
          </>
        )}
      </button>

      {/* Main Dock Panel */}
      {!collapsed && (
        <div className="pointer-events-auto w-full rounded-xl bg-slate-950/95 border border-slate-700/80 shadow-2xl p-3 sm:p-3.5">
          {/* Primary Parameter Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            {/* 1. Rain Intensity Slider */}
            <div className="rounded-lg bg-slate-900/90 border border-slate-800 px-3 py-2">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 font-medium text-slate-200">
                  <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                  <span>Intensiti Hujan</span>
                </span>
                <span className="font-mono-tabular font-semibold text-sky-300">
                  {params.rainIntensity} mm/j
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={120}
                step={5}
                value={params.rainIntensity}
                aria-label="Intensiti Hujan dalam milimeter sejam"
                onChange={(e) =>
                  onChangeParams({ ...params, rainIntensity: Number(e.target.value) })
                }
                className="hydro-slider"
              />
            </div>

            {/* 2. Urban Development / Impervious Surface Density */}
            <div className="rounded-lg bg-slate-900/90 border border-slate-800 px-3 py-2">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 font-medium text-slate-200">
                  <Building2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Pembangunan</span>
                </span>
                <span className="font-mono-tabular font-semibold text-amber-300">
                  {params.urbanDensity}% konkrit
                </span>
              </div>
              <input
                type="range"
                min={20}
                max={95}
                step={5}
                value={params.urbanDensity}
                aria-label="Kepadatan pembangunan dan permukaan konkrit"
                onChange={(e) =>
                  onChangeParams({ ...params, urbanDensity: Number(e.target.value) })
                }
                className="hydro-slider"
              />
            </div>

            {/* 3. Drainage Maintenance Toggle */}
            <div className="rounded-lg bg-slate-900/90 border border-slate-800 px-3 py-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 font-medium text-slate-200">
                  <Wrench className="w-3.5 h-3.5 text-slate-300" />
                  <span>Sistem Perparitan</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 bg-slate-950 p-0.5 rounded-md border border-slate-800">
                <button
                  type="button"
                  onClick={() =>
                    onChangeParams({ ...params, drainageClogged: false })
                  }
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    !params.drainageClogged
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Bersih
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChangeParams({ ...params, drainageClogged: true })
                  }
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    params.drainageClogged
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Tersumbat
                </button>
              </div>
            </div>

            {/* 4. Green Mitigation Toggle */}
            <div className="rounded-lg bg-slate-900/90 border border-slate-800 px-3 py-2 flex flex-col justify-between">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 font-medium text-slate-200">
                  <Trees className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Langkah Hijau</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() =>
                  onChangeParams({ ...params, greenMitigation: !params.greenMitigation })
                }
                className={`w-full px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap ${
                  params.greenMitigation
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-slate-950 border-slate-700 text-slate-300 hover:border-slate-500'
                }`}
              >
                {params.greenMitigation
                  ? 'Aktif: Kolam & Telap Air'
                  : 'Aktifkan Langkah Lestari'}
              </button>
            </div>
          </div>

          {/* Camera Views & AR Scale Row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400 mr-1">
                <Compass className="w-3.5 h-3.5" />
                <span>Sudut:</span>
              </span>
              {CAMERA_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectCameraPreset(opt.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                    cameraPreset === opt.id
                      ? 'bg-slate-100 text-slate-950 font-semibold'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {viewMode === 'ar' && (
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-2">
                  <Camera className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-xs text-slate-300 whitespace-nowrap">
                    Saiz AR:
                  </span>
                  <input
                    type="range"
                    min={0.5}
                    max={1.5}
                    step={0.05}
                    value={arScale}
                    aria-label="Skala model AR"
                    onChange={(e) => onChangeArScale(Number(e.target.value))}
                    className="hydro-slider w-20"
                  />
                  <span className="font-mono-tabular text-xs text-sky-300 w-9">
                    {arScale.toFixed(1)}x
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onRecenterAr}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Pusat</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
