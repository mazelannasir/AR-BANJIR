import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface HandFrameState {
  detected: boolean;
  cursorX: number; // 0..1 normalized viewport X
  cursorY: number; // 0..1 normalized viewport Y
  isPinching: boolean;
  justPinched: boolean;
  justReleased: boolean;
  fingerCount: number; // 0..4 (index, middle, ring, pinky)
  landmarks: NormalizedLandmark[] | null;
}

export type HandTrackerStatus =
  | 'off'
  | 'loading'
  | 'ready'
  | 'denied'
  | 'unavailable'
  | 'error';

const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function countRaisedFingers(lm: NormalizedLandmark[]): number {
  let count = 0;
  // Index (8 vs 6), Middle (12 vs 10), Ring (16 vs 14), Pinky (20 vs 18)
  const pairs: [number, number][] = [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ];
  for (const [tipIdx, pipIdx] of pairs) {
    if (lm[tipIdx].y < lm[pipIdx].y - 0.025) {
      count += 1;
    }
  }
  return count;
}

export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
  mirror: boolean,
  isPinching: boolean
) {
  ctx.clearRect(0, 0, width, height);
  const mapX = (x: number) => (mirror ? 1 - x : x) * width;
  const mapY = (y: number) => y * height;

  ctx.lineWidth = 2;
  ctx.strokeStyle = isPinching ? '#34d399' : '#38bdf8';

  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarks[a];
    const pb = landmarks[b];
    ctx.beginPath();
    ctx.moveTo(mapX(pa.x), mapY(pa.y));
    ctx.lineTo(mapX(pb.x), mapY(pb.y));
    ctx.stroke();
  }

  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    const isTip = i === 4 || i === 8;
    ctx.beginPath();
    ctx.arc(mapX(p.x), mapY(p.y), isTip ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = isTip ? (isPinching ? '#10b981' : '#fbbf24') : '#e2e8f0';
    ctx.fill();
  }
}

export function useHandTracking(options: {
  enabled: boolean;
  facingMode?: 'user' | 'environment';
  mirror?: boolean;
}) {
  const { enabled, facingMode = 'user', mirror = true } = options;

  const [status, setStatus] = useState<HandTrackerStatus>('off');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const prevPinchingRef = useRef(false);
  const smoothPosRef = useRef({ x: 0.5, y: 0.5, initialized: false });

  const handStateRef = useRef<HandFrameState>({
    detected: false,
    cursorX: 0.5,
    cursorY: 0.5,
    isPinching: false,
    justPinched: false,
    justReleased: false,
    fingerCount: 0,
    landmarks: null,
  });

  // Initialize hidden/shared offscreen video element for inference
  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      setErrorMessage(null);
      setStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
      handStateRef.current.detected = false;
      handStateRef.current.isPinching = false;
      prevPinchingRef.current = false;
      smoothPosRef.current.initialized = false;
      return;
    }

    let cancelled = false;
    let activeStream: MediaStream | null = null;
    let rafId = 0;
    let lastVideoTime = -1;

    const init = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable');
        setErrorMessage('Kamera tidak tersedia pada peranti ini.');
        return;
      }

      setStatus('loading');
      setErrorMessage(null);

      try {
        activeStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (cancelled) {
          activeStream.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(activeStream);

        // Create internal video element for stable MediaPipe detection
        const video = document.createElement('video');
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        video.srcObject = activeStream;
        videoElRef.current = video;
        await video.play();

        if (!landmarkerRef.current) {
          const vision = await FilesetResolver.forVisionTasks('/mediapipe-wasm');
          try {
            landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: HAND_MODEL_URL,
                delegate: 'GPU',
              },
              runningMode: 'VIDEO',
              numHands: 1,
              minHandDetectionConfidence: 0.55,
              minHandPresenceConfidence: 0.55,
              minTrackingConfidence: 0.55,
            });
          } catch {
            // Fallback cleanly to CPU delegate if WebGL GPU delegate unavailable
            landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: HAND_MODEL_URL,
                delegate: 'CPU',
              },
              runningMode: 'VIDEO',
              numHands: 1,
            });
          }
        }

        if (cancelled) return;
        setStatus('ready');

        const detectLoop = () => {
          if (cancelled) return;
          const lmModel = landmarkerRef.current;
          const vid = videoElRef.current;

          if (lmModel && vid && vid.readyState >= 2 && vid.currentTime !== lastVideoTime) {
            lastVideoTime = vid.currentTime;
            const res = lmModel.detectForVideo(vid, performance.now());

            if (res.landmarks && res.landmarks.length > 0) {
              const lm = res.landmarks[0];
              const thumbTip = lm[4];
              const indexTip = lm[8];
              const wrist = lm[0];
              const midMcp = lm[9];

              // Palm scale normalization
              const palmSize = Math.max(
                0.04,
                Math.hypot(midMcp.x - wrist.x, midMcp.y - wrist.y)
              );
              const pinchDist = Math.hypot(
                thumbTip.x - indexTip.x,
                thumbTip.y - indexTip.y
              );
              const pinchRatio = pinchDist / palmSize;

              // Hysteresis for reliable pinch
              const wasPinching = prevPinchingRef.current;
              const isPinching = wasPinching ? pinchRatio < 0.55 : pinchRatio < 0.42;
              const justPinched = !wasPinching && isPinching;
              const justReleased = wasPinching && !isPinching;
              prevPinchingRef.current = isPinching;

              // Cursor tracks midpoint during pinch, index tip otherwise
              const rawX = isPinching
                ? (thumbTip.x + indexTip.x) * 0.5
                : indexTip.x;
              const rawY = isPinching
                ? (thumbTip.y + indexTip.y) * 0.5
                : indexTip.y;

              const mappedX = mirror ? 1 - rawX : rawX;
              const mappedY = rawY;

              if (!smoothPosRef.current.initialized) {
                smoothPosRef.current = { x: mappedX, y: mappedY, initialized: true };
              } else {
                smoothPosRef.current.x += (mappedX - smoothPosRef.current.x) * 0.36;
                smoothPosRef.current.y += (mappedY - smoothPosRef.current.y) * 0.36;
              }

              handStateRef.current = {
                detected: true,
                cursorX: Math.min(0.98, Math.max(0.02, smoothPosRef.current.x)),
                cursorY: Math.min(0.98, Math.max(0.02, smoothPosRef.current.y)),
                isPinching,
                justPinched,
                justReleased,
                fingerCount: countRaisedFingers(lm),
                landmarks: lm,
              };
            } else {
              const wasPinching = prevPinchingRef.current;
              prevPinchingRef.current = false;
              handStateRef.current = {
                detected: false,
                cursorX: smoothPosRef.current.x,
                cursorY: smoothPosRef.current.y,
                isPinching: false,
                justPinched: false,
                justReleased: wasPinching,
                fingerCount: 0,
                landmarks: null,
              };
            }
          }

          rafId = requestAnimationFrame(detectLoop);
        };

        rafId = requestAnimationFrame(detectLoop);
      } catch (err: unknown) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setStatus('denied');
          setErrorMessage('Kebenaran kamera ditolak. Sila benarkan akses kamera pada pelayar anda.');
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setStatus('unavailable');
          setErrorMessage('Tiada kamera dikesan pada peranti ini.');
        } else {
          setStatus('error');
          setErrorMessage('Gagal memuatkan pengesan tangan kamera.');
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
      if (videoElRef.current) {
        videoElRef.current.srcObject = null;
        videoElRef.current = null;
      }
    };
  }, [enabled, facingMode, mirror]);

  const consumePinchEdges = useCallback(() => {
    handStateRef.current.justPinched = false;
    handStateRef.current.justReleased = false;
  }, []);

  return {
    status,
    errorMessage,
    stream,
    handStateRef,
    consumePinchEdges,
  };
}
