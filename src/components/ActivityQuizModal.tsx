import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Hand,
  Play,
  RotateCcw,
  Target,
  X,
  XCircle,
} from 'lucide-react';
import {
  HydrologyMetrics,
  QUIZ_QUESTIONS,
  SIMULATION_MISSIONS,
  SimulationMission,
  SimulationParams,
} from '../data/floodCurriculum';
import {
  HandFrameState,
  HandTrackerStatus,
  drawHandSkeleton,
} from '../utils/useHandTracking';
import { soundEngine } from '../utils/soundEngine';

interface ActivityQuizModalProps {
  open: boolean;
  initialTab?: 'missions' | 'quiz';
  onClose: () => void;
  activeMissionId: string | null;
  completedMissionIds: string[];
  onStartMission: (mission: SimulationMission) => void;
  currentParams: SimulationParams;
  currentMetrics: HydrologyMetrics;
  handTrackingEnabled: boolean;
  onToggleHandTracking: (enabled: boolean) => void;
  handStatus: HandTrackerStatus;
  handErrorMessage: string | null;
  handStream: MediaStream | null;
  handStateRef: React.MutableRefObject<HandFrameState>;
  onConsumePinchEdges: () => void;
}

export const ActivityQuizModal: React.FC<ActivityQuizModalProps> = ({
  open,
  initialTab = 'missions',
  onClose,
  activeMissionId,
  completedMissionIds,
  onStartMission,
  currentParams,
  currentMetrics,
  handTrackingEnabled,
  onToggleHandTracking,
  handStatus,
  handErrorMessage,
  handStream,
  handStateRef,
  onConsumePinchEdges,
}) => {
  const [tab, setTab] = useState<'missions' | 'quiz'>(initialTab);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [correctedIds, setCorrectedIds] = useState<Record<string, boolean>>({});

  // Live Hand Gesture UI State inside Quiz
  const [detectedFingers, setDetectedFingers] = useState(0);
  const [dwellOptionIdx, setDwellOptionIdx] = useState<number | null>(null);
  const [dwellProgress, setDwellProgress] = useState(0);
  const [hoveredOptIdx, setHoveredOptIdx] = useState<number | null>(null);
  const [handDetected, setHandDetected] = useState(false);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const quizCursorRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const submitBtnRef = useRef<HTMLButtonElement | null>(null);

  const currentQIdxRef = useRef(currentQIdx);
  currentQIdxRef.current = currentQIdx;
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const quizSubmittedRef = useRef(quizSubmitted);
  quizSubmittedRef.current = quizSubmitted;

  // Sync tab when modal opens
  useEffect(() => {
    if (open) {
      setTab(initialTab);
    }
  }, [open, initialTab]);

  // Attach hand stream to quiz preview video
  useEffect(() => {
    if (open && tab === 'quiz' && handStream && previewVideoRef.current) {
      previewVideoRef.current.srcObject = handStream;
      void previewVideoRef.current.play().catch(() => {});
    }
  }, [open, tab, handStream]);

  // Apply answer selection (from either hand gesture or fallback click)
  const applyOptionChoice = (qIndex: number, optionIdx: number, viaHand: boolean) => {
    const q = QUIZ_QUESTIONS[qIndex];
    if (!q) return;

    const alreadySubmitted = quizSubmittedRef.current;
    const isCorrect = optionIdx === q.correctIndex;

    if (!alreadySubmitted) {
      setAnswers((prev) => ({ ...prev, [q.id]: optionIdx }));
      soundEngine.playTone('select');
      return;
    }

    // Correction Mode after submission: require hand gesture when camera is available!
    const prevChoice = answersRef.current[q.id];
    const wasWrong = prevChoice !== q.correctIndex;
    if (!wasWrong) return;

    const cameraBlocked =
      handStatus === 'denied' || handStatus === 'unavailable' || handStatus === 'error';
    if (!viaHand && !cameraBlocked) {
      // Prompt user to use their hand to correct wrong answer
      soundEngine.playTone('error');
      return;
    }

    setAnswers((prev) => ({ ...prev, [q.id]: optionIdx }));
    if (isCorrect) {
      setCorrectedIds((prev) => ({ ...prev, [q.id]: true }));
      soundEngine.playTone('success');
    } else {
      soundEngine.playTone('error');
    }
  };

  const applyOptionChoiceRef = useRef(applyOptionChoice);
  applyOptionChoiceRef.current = applyOptionChoice;

  // 60fps Hand Gesture Poll Loop inside Quiz Tab (1-4 Fingers Dwell + Point-and-Pinch)
  useEffect(() => {
    if (!open || tab !== 'quiz' || !handTrackingEnabled) {
      setHandDetected(false);
      setDetectedFingers(0);
      setDwellOptionIdx(null);
      setDwellProgress(0);
      setHoveredOptIdx(null);
      return;
    }

    let rafId = 0;
    let dwellTarget: number | null = null;
    let dwellStart = 0;
    let lastLockedOption: number | null = null;
    let lastUiSync = 0;

    const step = (now: number) => {
      const hand = handStateRef.current;

      // Draw skeleton on quiz preview canvas
      const canvas = previewCanvasRef.current;
      if (canvas && hand.detected && hand.landmarks) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          drawHandSkeleton(ctx, hand.landmarks, canvas.width, canvas.height, true, hand.isPinching);
        }
      } else if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }

      if (hand.detected) {
        const vx = hand.cursorX * window.innerWidth;
        const vy = hand.cursorY * window.innerHeight;

        if (quizCursorRef.current) {
          quizCursorRef.current.style.opacity = '1';
          quizCursorRef.current.style.transform = `translate3d(${vx.toFixed(1)}px, ${vy.toFixed(1)}px, 0) translate(-50%, -50%)`;
        }

        // 1. Check Point-and-Pinch hover over Option Cards A-D
        let foundHover: number | null = null;
        for (let i = 0; i < 4; i++) {
          const btn = optionRefs.current[i];
          if (!btn) continue;
          const rect = btn.getBoundingClientRect();
          if (vx >= rect.left && vx <= rect.right && vy >= rect.top && vy <= rect.bottom) {
            foundHover = i;
            break;
          }
        }

        // Check hover over Submit button
        let hoveringSubmit = false;
        if (submitBtnRef.current) {
          const sr = submitBtnRef.current.getBoundingClientRect();
          if (vx >= sr.left && vx <= sr.right && vy >= sr.top && vy <= sr.bottom) {
            hoveringSubmit = true;
          }
        }

        if (hand.justPinched) {
          if (foundHover !== null) {
            applyOptionChoiceRef.current(currentQIdxRef.current, foundHover, true);
          } else if (hoveringSubmit && submitBtnRef.current && !submitBtnRef.current.disabled) {
            submitBtnRef.current.click();
          }
          onConsumePinchEdges();
        }

        // 2. Check 1-4 Raised Fingers Dwell Selection (1=A, 2=B, 3=C, 4=D)
        const fingerOpt =
          !hand.isPinching && hand.fingerCount >= 1 && hand.fingerCount <= 4
            ? hand.fingerCount - 1
            : null;

        let progress = 0;
        if (fingerOpt !== null) {
          if (dwellTarget !== fingerOpt) {
            dwellTarget = fingerOpt;
            dwellStart = now;
            lastLockedOption = null;
          } else {
            const elapsedDwell = now - dwellStart;
            progress = Math.min(1, elapsedDwell / 850);
            if (progress >= 1 && lastLockedOption !== fingerOpt) {
              lastLockedOption = fingerOpt;
              applyOptionChoiceRef.current(currentQIdxRef.current, fingerOpt, true);
            }
          }
        } else {
          dwellTarget = null;
          lastLockedOption = null;
        }

        if (now - lastUiSync > 70) {
          lastUiSync = now;
          setHandDetected(true);
          setDetectedFingers(hand.fingerCount);
          setHoveredOptIdx(foundHover);
          setDwellOptionIdx(dwellTarget);
          setDwellProgress(progress);
        }
      } else {
        if (quizCursorRef.current) {
          quizCursorRef.current.style.opacity = '0';
        }
        dwellTarget = null;
        lastLockedOption = null;
        if (now - lastUiSync > 120) {
          lastUiSync = now;
          setHandDetected(false);
          setDetectedFingers(0);
          setHoveredOptIdx(null);
          setDwellOptionIdx(null);
          setDwellProgress(0);
        }
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [open, tab, handTrackingEnabled, handStateRef, onConsumePinchEdges, handStatus]);

  if (!open) return null;

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = QUIZ_QUESTIONS.length;
  const score = QUIZ_QUESTIONS.reduce((acc, q) => {
    return acc + (answers[q.id] === q.correctIndex ? 1 : 0);
  }, 0);
  const allCorrect = quizSubmitted && score === totalQuestions;

  const currentQ = QUIZ_QUESTIONS[currentQIdx];
  const chosen = answers[currentQ.id];
  const isCurrentCorrect = chosen === currentQ.correctIndex;
  const needsHandCorrection = quizSubmitted && !isCurrentCorrect;

  const cameraUnavailable =
    handStatus === 'denied' || handStatus === 'unavailable' || handStatus === 'error';

  const handleSubmitQuiz = () => {
    setQuizSubmitted(true);
    const firstWrongIdx = QUIZ_QUESTIONS.findIndex(
      (q) => answers[q.id] !== q.correctIndex
    );
    if (firstWrongIdx >= 0) {
      setCurrentQIdx(firstWrongIdx);
      soundEngine.playTone('error');
    } else {
      soundEngine.playTone('success');
    }
  };

  const handleResetQuiz = () => {
    setAnswers({});
    setCorrectedIds({});
    setQuizSubmitted(false);
    setCurrentQIdx(0);
    soundEngine.playTone('toggle');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Aktiviti dan Kuiz Sains Tingkatan 4"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 sm:p-4"
    >
      {/* Floating Hand Cursor inside Modal */}
      {tab === 'quiz' && handTrackingEnabled && (
        <div
          ref={quizCursorRef}
          className="fixed top-0 left-0 z-[70] pointer-events-none opacity-0"
          style={{ willChange: 'transform, opacity' }}
        >
          <div className="w-9 h-9 rounded-full border-2 border-sky-400 bg-sky-500/20 flex items-center justify-center shadow-lg">
            <Hand className="w-4 h-4 text-sky-200" />
          </div>
        </div>
      )}

      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-slate-950 border border-slate-700/80 shadow-2xl overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-800">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              Uji Kefahaman: Pembangunan &amp; Banjir
            </h2>
            <p className="text-xs text-slate-400">
              Sains Tingkatan 4 · Kelestarian Ekosistem Air
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup tetingkap"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Segmented Tab Bar */}
        <div className="px-5 pt-3 pb-2.5 border-b border-slate-800/70 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('missions')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === 'missions'
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-900 text-slate-300 hover:text-white'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>Aktiviti Simulasi (3 Misi)</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('quiz')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === 'quiz'
                  ? 'bg-sky-500 text-slate-950'
                  : 'bg-slate-900 text-slate-300 hover:text-white'
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>Kuiz Tangan Kamera ({totalQuestions} Soalan)</span>
            </button>
          </div>

          {tab === 'quiz' && (
            <button
              type="button"
              onClick={() => onToggleHandTracking(!handTrackingEnabled)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap ${
                handTrackingEnabled
                  ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                  : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-sky-400'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>
                {handTrackingEnabled ? 'Tangan Kamera: Aktif' : 'Aktifkan Tangan Kamera'}
              </span>
            </button>
          )}
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto custom-scroll p-5 space-y-4">
          {tab === 'missions' ? (
            <>
              <p className="text-xs text-slate-300 leading-relaxed">
                Pilih satu misi di bawah untuk memuatkan senario ke dalam model 3D/AR. Anda boleh menggunakan kawalan slaid atau mengambil bahan 3D secara terus dengan tangan kamera!
              </p>

              <div className="space-y-3">
                {SIMULATION_MISSIONS.map((mission) => {
                  const isCompleted = completedMissionIds.includes(mission.id);
                  const isActive = activeMissionId === mission.id;
                  const livePassed =
                    isActive && mission.checkSuccess(currentParams, currentMetrics);

                  return (
                    <div
                      key={mission.id}
                      className={`rounded-xl border p-4 transition-colors ${
                        isCompleted || livePassed
                          ? 'bg-emerald-950/30 border-emerald-700/70'
                          : isActive
                            ? 'bg-sky-950/30 border-sky-600/70'
                            : 'bg-slate-900/80 border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-display text-sm font-semibold text-white">
                          {mission.title}
                        </h3>
                        {(isCompleted || livePassed) && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-300 whitespace-nowrap">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Selesai</span>
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed mb-2">
                        {mission.scenario}
                      </p>

                      <div className="text-xs font-medium text-sky-300 mb-3">
                        Matlamat: {mission.goalText}
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] text-slate-400">
                          Petunjuk: {mission.hint}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onStartMission(mission);
                            onClose();
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-colors whitespace-nowrap shrink-0"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>{isActive ? 'Ulang Misi' : 'Cuba di Model 3D/AR'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {/* Hand Camera Panel for Answering & Correcting Quiz */}
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 flex flex-col sm:flex-row items-center gap-3.5">
                <div className="relative w-36 h-24 rounded-lg overflow-hidden bg-slate-950 border border-slate-700 shrink-0 flex items-center justify-center">
                  {handTrackingEnabled && handStream ? (
                    <>
                      <video
                        ref={previewVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover -scale-x-100 opacity-85"
                      />
                      <canvas
                        ref={previewCanvasRef}
                        width={144}
                        height={96}
                        className="absolute inset-0 w-full h-full"
                      />
                    </>
                  ) : (
                    <div className="text-center px-2">
                      <Camera className="w-5 h-5 text-slate-500 mx-auto mb-1" />
                      <span className="text-[10px] text-slate-400 block">
                        Kamera Tangan Tutup
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-1 text-xs space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <Hand className="w-3.5 h-3.5 text-sky-400" />
                      <span>Jawab &amp; Betulkan Kuiz Dengan Tangan</span>
                    </span>
                    {handTrackingEnabled && (
                      <span
                        className={`font-mono-tabular text-[11px] font-semibold ${
                          handDetected ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        {handStatus === 'loading'
                          ? 'Memuatkan...'
                          : handDetected
                            ? detectedFingers >= 1 && detectedFingers <= 4
                              ? `${detectedFingers} Jari (${String.fromCharCode(64 + detectedFingers)})`
                              : 'Tangan Dikesan'
                            : 'Tunjukkan Tangan'}
                      </span>
                    )}
                  </div>

                  {!handTrackingEnabled ? (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-[11px] text-slate-300">
                        Aktifkan kamera tangan untuk memilih jawapan dan memperbetulkan jawapan yang salah menggunakan isyarat tangan.
                      </p>
                      <button
                        type="button"
                        onClick={() => onToggleHandTracking(true)}
                        className="px-3 py-1 rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs whitespace-nowrap"
                      >
                        Hidupkan Kamera Tangan
                      </button>
                    </div>
                  ) : cameraUnavailable ? (
                    <p className="text-[11px] text-amber-300">
                      {handErrorMessage} (Anda masih boleh mengklik pilihan secara manual.)
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Tunjuk <strong className="text-sky-300">1–4 jari</strong> (1=A, 2=B, 3=C, 4=D) selama 1 saat <em>atau</em> arahkan kursor tangan &amp; <strong className="text-emerald-300">cubit</strong> pada pilihan jawapan.
                    </p>
                  )}
                </div>
              </div>

              {/* Question Stepper Pills & Score */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  {QUIZ_QUESTIONS.map((q, idx) => {
                    const ans = answers[q.id];
                    const hasAns = ans !== undefined;
                    const qCorrect = ans === q.correctIndex;
                    const isCur = idx === currentQIdx;

                    let btnTone = 'bg-slate-900 border-slate-800 text-slate-400';
                    if (quizSubmitted) {
                      btnTone = qCorrect
                        ? 'bg-emerald-950/70 border-emerald-500 text-emerald-200'
                        : 'bg-rose-950/70 border-rose-500 text-rose-200';
                    } else if (hasAns) {
                      btnTone = 'bg-sky-950/70 border-sky-500 text-sky-200';
                    }

                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => setCurrentQIdx(idx)}
                        className={`px-2.5 py-1 rounded-md border text-xs font-mono-tabular font-semibold transition-colors ${btnTone} ${
                          isCur ? 'ring-2 ring-white/70' : ''
                        }`}
                      >
                        S{idx + 1}
                      </button>
                    );
                  })}
                </div>

                <div className="text-xs font-mono-tabular text-slate-300">
                  {quizSubmitted ? (
                    <span
                      className={
                        allCorrect ? 'text-emerald-300 font-bold' : 'text-amber-300 font-bold'
                      }
                    >
                      Skor: {score}/{totalQuestions}
                    </span>
                  ) : (
                    <span>
                      Dijawab: {answeredCount}/{totalQuestions}
                    </span>
                  )}
                </div>
              </div>

              {/* Correction Prompt Banner */}
              {needsHandCorrection && (
                <div className="rounded-lg bg-amber-950/60 border border-amber-500/70 px-3.5 py-2.5 text-xs text-amber-100 flex items-center gap-2">
                  <Hand className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>
                    <strong>Jawapan Salah — Pembetulan Tangan Diperlukan:</strong>{' '}
                    {cameraUnavailable
                      ? 'Pilih jawapan yang betul untuk memperbetulkannya.'
                      : 'Gunakan Tangan Kamera (tunjuk 1–4 jari atau cubit pilihan yang betul) untuk memperbetulkan soalan ini!'}
                  </span>
                </div>
              )}

              {allCorrect && (
                <div className="rounded-lg bg-emerald-950/60 border border-emerald-500 px-3.5 py-2.5 text-xs text-emerald-100 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Tahniah!</strong> Semua {totalQuestions} soalan telah dijawab dan diperbetulkan dengan tepat.
                  </span>
                </div>
              )}

              {/* Active Focused Question Card */}
              <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-mono-tabular text-xs font-semibold text-sky-400">
                    Soalan {currentQIdx + 1} daripada {totalQuestions}
                  </span>
                  {correctedIds[currentQ.id] && isCurrentCorrect && (
                    <span className="text-[11px] font-semibold text-emerald-300">
                      Diperbetulkan dengan Tangan
                    </span>
                  )}
                </div>

                <h3 className="text-sm sm:text-base font-semibold text-white leading-snug mb-3.5">
                  {currentQ.question}
                </h3>

                <div className="space-y-2.5">
                  {currentQ.options.map((opt, oIdx) => {
                    const selected = chosen === oIdx;
                    const isHandHovered = hoveredOptIdx === oIdx;
                    const isDwelling = dwellOptionIdx === oIdx;

                    let optionStyle =
                      'bg-slate-950 border-slate-800 text-slate-200 hover:border-slate-600';

                    if (quizSubmitted) {
                      if (selected && oIdx === currentQ.correctIndex) {
                        optionStyle =
                          'bg-emerald-950/60 border-emerald-500 text-emerald-100';
                      } else if (selected && oIdx !== currentQ.correctIndex) {
                        optionStyle = 'bg-rose-950/60 border-rose-500 text-rose-100';
                      }
                    } else if (selected) {
                      optionStyle = 'bg-sky-950/75 border-sky-400 text-white';
                    }

                    if (isHandHovered) {
                      optionStyle += ' ring-2 ring-sky-400';
                    }

                    const lockedManualClick = needsHandCorrection && !cameraUnavailable;

                    return (
                      <button
                        key={oIdx}
                        ref={(el) => {
                          optionRefs.current[oIdx] = el;
                        }}
                        type="button"
                        onClick={() => applyOptionChoice(currentQIdx, oIdx, false)}
                        className={`relative w-full text-left px-3.5 py-3 rounded-lg border text-xs leading-relaxed transition-colors overflow-hidden flex items-start gap-2.5 ${optionStyle} ${
                          lockedManualClick ? 'cursor-not-allowed' : ''
                        }`}
                      >
                        {/* Finger Dwell Progress Fill */}
                        {isDwelling && dwellProgress > 0 && (
                          <span
                            className="absolute inset-y-0 left-0 bg-sky-400/20 pointer-events-none"
                            style={{ width: `${Math.round(dwellProgress * 100)}%` }}
                          />
                        )}

                        <span className="relative z-10 font-mono-tabular font-semibold text-sky-300 shrink-0">
                          {String.fromCharCode(65 + oIdx)} [{oIdx + 1} Jari]
                        </span>
                        <span className="relative z-10 flex-1">{opt}</span>

                        {quizSubmitted && selected && oIdx === currentQ.correctIndex && (
                          <CheckCircle2 className="relative z-10 w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        )}
                        {quizSubmitted && selected && oIdx !== currentQ.correctIndex && (
                          <XCircle className="relative z-10 w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {quizSubmitted && isCurrentCorrect && (
                  <div className="mt-3 rounded-lg p-3 text-xs leading-relaxed border bg-emerald-950/40 border-emerald-800/70 text-emerald-100">
                    <strong className="block mb-0.5">Jawapan Tepat!</strong>
                    {currentQ.explanation}
                  </div>
                )}

                {/* Prev / Next Question Nav */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800/80">
                  <button
                    type="button"
                    disabled={currentQIdx === 0}
                    onClick={() => setCurrentQIdx((i) => Math.max(0, i - 1))}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-300 hover:text-white disabled:opacity-35"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Soalan Sebelum</span>
                  </button>
                  <button
                    type="button"
                    disabled={currentQIdx === totalQuestions - 1}
                    onClick={() =>
                      setCurrentQIdx((i) => Math.min(totalQuestions - 1, i + 1))
                    }
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-300 hover:text-white disabled:opacity-35"
                  >
                    <span>Soalan Seterusnya</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 flex items-center justify-between gap-3 bg-slate-950">
          {tab === 'quiz' ? (
            <>
              <button
                type="button"
                onClick={handleResetQuiz}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Set Semula</span>
              </button>
              {!quizSubmitted ? (
                <button
                  ref={submitBtnRef}
                  type="button"
                  disabled={answeredCount < totalQuestions}
                  onClick={handleSubmitQuiz}
                  className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-semibold text-xs transition-colors"
                >
                  Semak Jawapan ({answeredCount}/{totalQuestions})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors"
                >
                  {allCorrect ? 'Selesai & Kembali' : 'Kembali ke Model 3D/AR'}
                </button>
              )}
            </>
          ) : (
            <div className="w-full flex items-center justify-between">
              <span className="text-xs text-slate-400 font-mono-tabular">
                Misi selesai: {completedMissionIds.length} / {SIMULATION_MISSIONS.length}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors"
              >
                Tutup
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
