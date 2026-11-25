import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Camera,
  CheckCircle2,
  ClipboardList,
  Eye,
  EyeOff,
  Hand,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  CameraPresetId,
  SCIENTIFIC_HOTSPOTS,
  SIMULATION_MISSIONS,
  SimulationMission,
  SimulationParams,
  calculateHydrology,
} from './data/floodCurriculum';
import {
  PickableActionEvent,
  UrbanFloodViewport,
  ViewMode,
} from './components/UrbanFloodViewport';
import { ScientificCard } from './components/ScientificCard';
import { ControlDock } from './components/ControlDock';
import { ActivityQuizModal } from './components/ActivityQuizModal';
import { soundEngine } from './utils/soundEngine';
import { useHandTracking } from './utils/useHandTracking';

const DEFAULT_PARAMS: SimulationParams = {
  rainIntensity: 65,
  urbanDensity: 80,
  drainageClogged: false,
  greenMitigation: false,
};

export default function App() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [viewMode, setViewMode] = useState<ViewMode>('3d');
  const [arScale, setArScale] = useState<number>(1.0);
  const [arRecenterCounter, setArRecenterCounter] = useState(0);

  const [handTrackingEnabled, setHandTrackingEnabled] = useState(false);

  const [showLabels, setShowLabels] = useState(true);
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(
    'urban-impervious'
  );
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('overview');
  const [cameraResetCounter, setCameraResetCounter] = useState(0);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const [soundMuted, setSoundMuted] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'missions' | 'quiz'>('missions');

  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const [completedMissionIds, setCompletedMissionIds] = useState<string[]>([]);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Shared MediaPipe Hand Tracking Camera Hook
  const {
    status: handStatus,
    errorMessage: handErrorMessage,
    stream: handStream,
    handStateRef,
    consumePinchEdges,
  } = useHandTracking({
    enabled: handTrackingEnabled,
    facingMode: 'user',
    mirror: true,
  });

  const metrics = useMemo(() => calculateHydrology(params), [params]);

  const selectedHotspot = useMemo(
    () => SCIENTIFIC_HOTSPOTS.find((h) => h.id === selectedHotspotId) ?? null,
    [selectedHotspotId]
  );

  const activeMission = useMemo(
    () => SIMULATION_MISSIONS.find((m) => m.id === activeMissionId) ?? null,
    [activeMissionId]
  );

  const activeMissionPassed = useMemo(() => {
    if (!activeMission) return false;
    return activeMission.checkSuccess(params, metrics);
  }, [activeMission, params, metrics]);

  useEffect(() => {
    if (activeMission && activeMissionPassed) {
      setCompletedMissionIds((prev) => {
        if (prev.includes(activeMission.id)) return prev;
        soundEngine.playTone('success');
        return [...prev, activeMission.id];
      });
    }
  }, [activeMission, activeMissionPassed]);

  useEffect(() => {
    soundEngine.updateRainAudio(params.rainIntensity);
  }, [params.rainIntensity]);

  useEffect(() => {
    return () => {
      soundEngine.dispose();
    };
  }, []);

  // Auto-dismiss hand pickup toast
  useEffect(() => {
    if (!actionToast) return;
    const t = window.setTimeout(() => setActionToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [actionToast]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      } else if (e.key === 'l' || e.key === 'L') {
        setShowLabels((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (modalOpen) setModalOpen(false);
        else if (selectedHotspotId) setSelectedHotspotId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalOpen, selectedHotspotId]);

  const handleSelectHotspot = useCallback((id: string) => {
    setSelectedHotspotId(id);
    const found = SCIENTIFIC_HOTSPOTS.find((h) => h.id === id);
    if (found) {
      setCameraPreset(found.cameraPreset);
      setCameraResetCounter((c) => c + 1);
    }
    soundEngine.playTone('select');
  }, []);

  const handlePickableAction = useCallback((evt: PickableActionEvent) => {
    if (evt.type === 'clean-drain') {
      setParams((prev) => ({ ...prev, drainageClogged: false }));
    } else if (evt.type === 'activate-green') {
      setParams((prev) => ({ ...prev, greenMitigation: true }));
    }
    setSelectedHotspotId(evt.hotspotId);
    setActionToast(evt.message);
  }, []);

  const handleSelectCameraPreset = useCallback((preset: CameraPresetId) => {
    setCameraPreset(preset);
    setCameraResetCounter((c) => c + 1);
    soundEngine.playTone('toggle');
  }, []);

  const handleToggleSound = () => {
    const nextMuted = !soundMuted;
    setSoundMuted(nextMuted);
    soundEngine.setMuted(nextMuted);
    if (!nextMuted) {
      soundEngine.playTone('toggle');
    }
  };

  const handleStartMission = (mission: SimulationMission) => {
    setParams({ ...mission.setupParams });
    setActiveMissionId(mission.id);
    setSelectedHotspotId(null);
    setCameraPreset('overview');
    setCameraResetCounter((c) => c + 1);
    soundEngine.playTone('select');
  };

  const handleSwitchViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'ar') {
      // Automatically activate camera hand interaction in AR mode
      setHandTrackingEnabled(true);
    }
    soundEngine.playTone('toggle');
  };

  const statusConfig =
    metrics.status === 'BANJIR KILAT'
      ? {
          icon: AlertTriangle,
          color: 'text-rose-300',
          border: 'border-rose-600/70',
          bg: 'bg-rose-950/90',
          label: 'BANJIR KILAT',
        }
      : metrics.status === 'BERJAGA-JAGA'
        ? {
            icon: AlertTriangle,
            color: 'text-amber-300',
            border: 'border-amber-600/70',
            bg: 'bg-amber-950/85',
            label: 'BERJAGA-JAGA',
          }
        : {
            icon: ShieldCheck,
            color: 'text-emerald-300',
            border: 'border-emerald-700/70',
            bg: 'bg-slate-950/92',
            label: 'SELAMAT',
          };

  const StatusIcon = statusConfig.icon;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-50">
      {/* Full-Bleed 3D & Camera-Passthrough AR Viewport */}
      <UrbanFloodViewport
        params={params}
        metrics={metrics}
        viewMode={viewMode}
        arScale={arScale}
        showLabels={showLabels}
        selectedHotspotId={selectedHotspotId}
        cameraPreset={cameraPreset}
        cameraResetCounter={cameraResetCounter}
        arRecenterCounter={arRecenterCounter}
        handTrackingEnabled={handTrackingEnabled}
        handStatus={handStatus}
        handErrorMessage={handErrorMessage}
        handStream={handStream}
        handStateRef={handStateRef}
        onConsumePinchEdges={consumePinchEdges}
        modalOpen={modalOpen}
        onSelectHotspot={handleSelectHotspot}
        onPickableAction={handlePickableAction}
      />

      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 z-40 h-14 px-3 sm:px-5 bg-slate-950/95 border-b border-slate-800/90 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h1 className="font-display text-sm sm:text-base font-bold tracking-tight text-white whitespace-nowrap truncate">
            Pembangunan &amp; Banjir AR
          </h1>
          <span className="hidden lg:inline text-xs text-slate-400 whitespace-nowrap">
            Sains Tingkatan 4 · Kelestarian Ekosistem Air
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* 3D / AR Mode Segmented Control */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => handleSwitchViewMode('3d')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === '3d'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>Mod 3D</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchViewMode('ar')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                viewMode === 'ar'
                  ? 'bg-sky-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Mod AR</span>
            </button>
          </div>

          {/* Camera Hand Grab Toggle */}
          <button
            type="button"
            onClick={() => {
              setHandTrackingEnabled((prev) => !prev);
              soundEngine.playTone('toggle');
            }}
            title="Ambil bahan AR dan jawab kuiz menggunakan tangan kamera"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap ${
              handTrackingEnabled
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                : 'bg-slate-900 border-slate-800 hover:border-slate-600 text-slate-200'
            }`}
          >
            <Hand className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tangan Kamera</span>
          </button>

          {/* Toggle 3D Scientific Labels */}
          <button
            type="button"
            onClick={() => setShowLabels((prev) => !prev)}
            title="Papar atau sembunyi label saintifik (L)"
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
          >
            {showLabels ? (
              <Eye className="w-3.5 h-3.5 text-sky-400" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>Label</span>
          </button>

          {/* Toggle Procedural Audio */}
          <button
            type="button"
            onClick={handleToggleSound}
            aria-label={soundMuted ? 'Aktifkan bunyi hujan' : 'Senyapkan bunyi'}
            title={soundMuted ? 'Aktifkan bunyi hujan' : 'Senyapkan bunyi'}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 text-slate-200 transition-colors"
          >
            {soundMuted ? (
              <VolumeX className="w-4 h-4 text-slate-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-sky-400" />
            )}
          </button>

          {/* Primary CTA: Activity & Quiz */}
          <button
            type="button"
            onClick={() => {
              setModalTab('quiz');
              setModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Aktiviti &amp; Kuiz</span>
          </button>
        </div>
      </header>

      {/* Top-Left Compact Hydrological Readout */}
      <div className="fixed top-18 left-3 sm:left-4 z-20 pointer-events-none flex flex-col gap-2 max-w-[235px]">
        <div
          className={`rounded-xl border px-3 py-2.5 shadow-lg ${statusConfig.bg} ${statusConfig.border}`}
        >
          <div className="flex items-center gap-1.5 text-xs font-bold tracking-wide mb-2">
            <StatusIcon className={`w-4 h-4 shrink-0 ${statusConfig.color}`} />
            <span className={statusConfig.color}>STATUS: {statusConfig.label}</span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
            <div>
              <div className="text-slate-400">Resapan Tanah</div>
              <div className="font-mono-tabular font-semibold text-emerald-300">
                {metrics.infiltrationRate}%
              </div>
            </div>
            <div>
              <div className="text-slate-400">Air Larian</div>
              <div className="font-mono-tabular font-semibold text-sky-300">
                {metrics.surfaceRunoffRate}%
              </div>
            </div>
            <div>
              <div className="text-slate-400">Beban Parit</div>
              <div
                className={`font-mono-tabular font-semibold ${
                  metrics.drainLoadPercent >= 100
                    ? 'text-rose-300'
                    : metrics.drainLoadPercent >= 80
                      ? 'text-amber-300'
                      : 'text-slate-100'
                }`}
              >
                {metrics.drainLoadPercent}%
              </div>
            </div>
            <div>
              <div className="text-slate-400">Paras Banjir</div>
              <div className="font-mono-tabular font-semibold text-white">
                {metrics.floodDepthMeters.toFixed(2)} m
              </div>
            </div>
          </div>
        </div>

        {/* Active Guided Simulation Mission Banner */}
        {activeMission && (
          <div
            className={`pointer-events-auto rounded-xl border px-3 py-2.5 shadow-lg text-xs ${
              activeMissionPassed
                ? 'bg-emerald-950/95 border-emerald-500 text-emerald-100'
                : 'bg-slate-950/95 border-sky-600/80 text-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className="font-semibold text-white leading-tight">
                {activeMission.title}
              </span>
              <button
                type="button"
                onClick={() => setActiveMissionId(null)}
                aria-label="Tutup misi"
                className="text-slate-400 hover:text-white shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {activeMissionPassed ? (
              <div className="flex items-start gap-1.5 text-emerald-200 leading-relaxed">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{activeMission.successMessage}</span>
              </div>
            ) : (
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {activeMission.goalText}
              </p>
            )}
          </div>
        )}

        {/* Hand Pickup Action Feedback Toast */}
        {actionToast && (
          <div className="rounded-xl border border-emerald-500 bg-emerald-950/95 px-3 py-2 text-xs font-medium text-emerald-100 shadow-lg">
            {actionToast}
          </div>
        )}
      </div>

      {/* Selected 3D Object / Hotspot Scientific Explanation Card */}
      <ScientificCard
        hotspot={selectedHotspot}
        onClose={() => setSelectedHotspotId(null)}
        onSelectHotspot={handleSelectHotspot}
      />

      {/* Collapsible Bottom Control Dock */}
      <ControlDock
        params={params}
        onChangeParams={setParams}
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((prev) => !prev)}
        cameraPreset={cameraPreset}
        onSelectCameraPreset={handleSelectCameraPreset}
        viewMode={viewMode}
        arScale={arScale}
        onChangeArScale={setArScale}
        onRecenterAr={() => setArRecenterCounter((c) => c + 1)}
      />

      {/* Interactive Simulation Missions & Hand-Gesture Quiz Modal */}
      <ActivityQuizModal
        open={modalOpen}
        initialTab={modalTab}
        onClose={() => setModalOpen(false)}
        activeMissionId={activeMissionId}
        completedMissionIds={completedMissionIds}
        onStartMission={handleStartMission}
        currentParams={params}
        currentMetrics={metrics}
        handTrackingEnabled={handTrackingEnabled}
        onToggleHandTracking={setHandTrackingEnabled}
        handStatus={handStatus}
        handErrorMessage={handErrorMessage}
        handStream={handStream}
        handStateRef={handStateRef}
        onConsumePinchEdges={consumePinchEdges}
      />
    </div>
  );
}
