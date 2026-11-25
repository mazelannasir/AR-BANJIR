import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Hand, RotateCcw, Trash2, Trees } from 'lucide-react';
import {
  CameraPresetId,
  HydrologyMetrics,
  SCIENTIFIC_HOTSPOTS,
  SimulationParams,
} from '../data/floodCurriculum';
import { createProceduralTextures } from '../three/proceduralTextures';
import {
  PickableItemId,
  UrbanDioramaHandle,
  createUrbanFloodDiorama,
} from '../three/urbanModels';
import {
  HandFrameState,
  HandTrackerStatus,
  drawHandSkeleton,
} from '../utils/useHandTracking';
import { soundEngine } from '../utils/soundEngine';

export type ViewMode = '3d' | 'ar';

export interface PickableActionEvent {
  type: 'clean-drain' | 'activate-green' | 'inspect';
  itemId: PickableItemId;
  hotspotId: string;
  message: string;
}

interface UrbanFloodViewportProps {
  params: SimulationParams;
  metrics: HydrologyMetrics;
  viewMode: ViewMode;
  arScale: number;
  showLabels: boolean;
  selectedHotspotId: string | null;
  cameraPreset: CameraPresetId;
  cameraResetCounter: number;
  arRecenterCounter: number;
  handTrackingEnabled: boolean;
  handStatus: HandTrackerStatus;
  handErrorMessage: string | null;
  handStream: MediaStream | null;
  handStateRef: React.MutableRefObject<HandFrameState>;
  onConsumePinchEdges: () => void;
  modalOpen: boolean;
  onSelectHotspot: (id: string) => void;
  onPickableAction: (evt: PickableActionEvent) => void;
  onWebXrSupportChange?: (supported: boolean) => void;
}

const CAMERA_PRESETS: Record<
  CameraPresetId,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { pos: [7.6, 5.6, 8.6], target: [-0.2, 0.85, 0.1] },
  drainage: { pos: [3.2, 2.3, 4.6], target: [0.85, 0.15, 0.9] },
  river: { pos: [6.8, 3.2, 5.1], target: [2.7, 0.1, 0.2] },
  mitigation: { pos: [-5.6, 3.4, 5.6], target: [-2.4, 0.4, 1.9] },
};

// Scratch math objects for zero GC inside render loop
const _projVec = new THREE.Vector3();
const _targetCamPos = new THREE.Vector3();
const _targetLookAt = new THREE.Vector3();
const _handNdc = new THREE.Vector2();
const _dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
const _planeHit = new THREE.Vector3();

export const UrbanFloodViewport: React.FC<UrbanFloodViewportProps> = ({
  params,
  metrics,
  viewMode,
  arScale,
  showLabels,
  selectedHotspotId,
  cameraPreset,
  cameraResetCounter,
  arRecenterCounter,
  handTrackingEnabled,
  handStatus,
  handErrorMessage,
  handStream,
  handStateRef,
  onConsumePinchEdges,
  modalOpen,
  onSelectHotspot,
  onPickableAction,
  onWebXrSupportChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipSkeletonRef = useRef<HTMLCanvasElement | null>(null);
  const handCursorRef = useRef<HTMLDivElement | null>(null);
  const pinRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Mutable refs read inside 60fps loop without tearing down WebGL
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const metricsRef = useRef(metrics);
  metricsRef.current = metrics;
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;
  const arScaleRef = useRef(arScale);
  arScaleRef.current = arScale;
  const showLabelsRef = useRef(showLabels);
  showLabelsRef.current = showLabels;
  const handEnabledRef = useRef(handTrackingEnabled);
  handEnabledRef.current = handTrackingEnabled;
  const modalOpenRef = useRef(modalOpen);
  modalOpenRef.current = modalOpen;
  const onSelectHotspotRef = useRef(onSelectHotspot);
  onSelectHotspotRef.current = onSelectHotspot;
  const onPickableActionRef = useRef(onPickableAction);
  onPickableActionRef.current = onPickableAction;
  const onConsumePinchRef = useRef(onConsumePinchEdges);
  onConsumePinchRef.current = onConsumePinchEdges;

  const camTransitionRef = useRef<{
    active: boolean;
    preset: CameraPresetId;
  }>({ active: false, preset: 'overview' });

  const arOffsetRef = useRef(new THREE.Vector3(0, -0.35, 0));
  const arGyroRef = useRef({ beta: 0, gamma: 0, enabled: false });

  const [webglError, setWebglError] = useState<string | null>(null);
  const [fallbackCamState, setFallbackCamState] = useState<
    'idle' | 'active' | 'denied' | 'unavailable'
  >('idle');
  const [webXrSupported, setWebXrSupported] = useState(false);
  const [webXrActive, setWebXrActive] = useState(false);

  // Hand interaction HUD state (only updated when hovered/held item changes, never every frame!)
  const [hoveredItemLabel, setHoveredItemLabel] = useState<string | null>(null);
  const [heldItemInfo, setHeldItemInfo] = useState<{
    id: PickableItemId;
    label: string;
    hint: string;
  } | null>(null);
  const [handDetectedUi, setHandDetectedUi] = useState(false);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const dioramaRef = useRef<UrbanDioramaHandle | null>(null);

  useEffect(() => {
    camTransitionRef.current = { active: true, preset: cameraPreset };
  }, [cameraPreset, cameraResetCounter]);

  useEffect(() => {
    arOffsetRef.current.set(0, -0.35, 0);
  }, [arRecenterCounter]);

  // Check WebXR immersive-ar availability
  useEffect(() => {
    let mounted = true;
    const nav = navigator as Navigator & {
      xr?: { isSessionSupported: (mode: string) => Promise<boolean> };
    };
    if (nav.xr?.isSessionSupported) {
      nav.xr
        .isSessionSupported('immersive-ar')
        .then((supported) => {
          if (mounted) {
            setWebXrSupported(supported);
            onWebXrSupportChange?.(supported);
          }
        })
        .catch(() => {
          if (mounted) setWebXrSupported(false);
        });
    }
    return () => {
      mounted = false;
    };
  }, [onWebXrSupportChange]);

  // Attach shared handStream to either full-bleed AR background <video> OR 3D PiP <video>
  useEffect(() => {
    if (viewMode === 'ar' && handStream && bgVideoRef.current) {
      bgVideoRef.current.srcObject = handStream;
      void bgVideoRef.current.play().catch(() => {});
    }
    if (viewMode === '3d' && handStream && pipVideoRef.current) {
      pipVideoRef.current.srcObject = handStream;
      void pipVideoRef.current.play().catch(() => {});
    }
  }, [viewMode, handStream, modalOpen]);

  // Fallback camera stream when in AR mode with Hand Tracking explicitly turned OFF
  useEffect(() => {
    let localStream: MediaStream | null = null;
    let cancelled = false;

    if (viewMode === 'ar' && !handTrackingEnabled) {
      if (!navigator.mediaDevices?.getUserMedia) {
        setFallbackCamState('unavailable');
        return;
      }
      navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        .then((s) => {
          if (cancelled) {
            s.getTracks().forEach((t) => t.stop());
            return;
          }
          localStream = s;
          if (bgVideoRef.current) {
            bgVideoRef.current.srcObject = s;
            void bgVideoRef.current.play().catch(() => {});
          }
          setFallbackCamState('active');
        })
        .catch((err) => {
          if (cancelled) return;
          const isPerm =
            err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
          setFallbackCamState(isPerm ? 'denied' : 'unavailable');
        });
    } else {
      setFallbackCamState('idle');
    }

    return () => {
      cancelled = true;
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, [viewMode, handTrackingEnabled]);

  // Optional DeviceOrientation parallax in AR mode on mobile
  useEffect(() => {
    if (viewMode !== 'ar') {
      arGyroRef.current.enabled = false;
      return;
    }
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) {
        arGyroRef.current.enabled = true;
        arGyroRef.current.gamma = THREE.MathUtils.clamp(e.gamma, -25, 25);
        arGyroRef.current.beta = THREE.MathUtils.clamp(e.beta - 45, -20, 20);
      }
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [viewMode]);

  // Core Three.js Initialization (Mounted Once)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('Peranti ini tidak menyokong WebGL untuk paparan 3D.');
      return;
    }

    rendererRef.current = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.xr.enabled = true;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const studioBgColor = new THREE.Color(0x0b1628);
    const stormBgColor = new THREE.Color(0x09101d);
    const horizonFog = new THREE.FogExp2(0x0b1628, 0.024);

    scene.background = studioBgColor.clone();
    scene.fog = horizonFog;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 120);
    camera.position.set(...CAMERA_PRESETS.overview.pos);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(...CAMERA_PRESETS.overview.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4.2;
    controls.maxDistance = 18.5;
    controls.maxPolarAngle = Math.PI * 0.475;
    controls.minPolarAngle = 0.22;

    const stopCamTransition = () => {
      camTransitionRef.current.active = false;
    };
    controls.addEventListener('start', stopCamTransition);

    // 3-Point Warm/Cool Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x334155, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.85);
    keyLight.position.set(7.5, 11.5, 6.5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.camera.left = -7.5;
    keyLight.shadow.camera.right = 7.5;
    keyLight.shadow.camera.top = 7.5;
    keyLight.shadow.camera.bottom = -7.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    rimLight.position.set(-7, 5, -7);
    scene.add(rimLight);

    const studioStageGeo = new THREE.CircleGeometry(14, 48);
    studioStageGeo.rotateX(-Math.PI / 2);
    const studioStageMat = new THREE.MeshStandardMaterial({
      color: 0x0f1c32,
      roughness: 0.92,
      metalness: 0.05,
    });
    const studioStage = new THREE.Mesh(studioStageGeo, studioStageMat);
    studioStage.position.y = -0.92;
    studioStage.receiveShadow = true;
    scene.add(studioStage);

    const reticleGeo = new THREE.RingGeometry(4.9, 5.15, 64);
    reticleGeo.rotateX(-Math.PI / 2);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const arReticle = new THREE.Mesh(reticleGeo, reticleMat);
    arReticle.position.y = -0.9;
    arReticle.visible = false;

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const textures = createProceduralTextures(maxAnisotropy);
    const diorama = createUrbanFloodDiorama(textures, isSoftwareGl);
    dioramaRef.current = diorama;
    diorama.root.add(arReticle);
    scene.add(diorama.root);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Raycasters: Layer 1 for clicks/inspection, Layer 2 for Hand & Pointer Picking
    const inspectRaycaster = new THREE.Raycaster();
    inspectRaycaster.layers.set(1);

    const pickRaycaster = new THREE.Raycaster();
    pickRaycaster.layers.set(2);

    const pointerNdc = new THREE.Vector2();
    let downPos = { x: 0, y: 0 };
    let lastHoveredId: PickableItemId | null = null;
    let currentGrabbedId: PickableItemId | null = null;
    let lastHandDetected = false;

    const evaluateReleaseAction = (dropped: {
      id: PickableItemId;
      localX: number;
      localZ: number;
    }) => {
      const info = diorama.getPickableInfo(dropped.id);
      if (!info) return;

      if (dropped.id === 'debris-pack') {
        // If debris pulled out of the drain channel (x around 1.02)
        if (Math.abs(dropped.localX - 1.02) > 0.75) {
          soundEngine.playTone('success');
          onPickableActionRef.current({
            type: 'clean-drain',
            itemId: dropped.id,
            hotspotId: info.hotspotId,
            message: 'Parit berjaya dibersihkan menggunakan tangan AR!',
          });
          return;
        }
      }

      if (dropped.id === 'eco-tree' || dropped.id === 'permeable-block') {
        // Dropped onto urban plaza area
        if (
          dropped.localX >= -3.9 &&
          dropped.localX <= 0.85 &&
          dropped.localZ >= -2.7 &&
          dropped.localZ <= 2.55
        ) {
          soundEngine.playTone('success');
          onPickableActionRef.current({
            type: 'activate-green',
            itemId: dropped.id,
            hotspotId: info.hotspotId,
            message: `${info.label} dipasang — Langkah Hijau diaktifkan!`,
          });
          return;
        }
      }

      soundEngine.playTone('toggle');
      onPickableActionRef.current({
        type: 'inspect',
        itemId: dropped.id,
        hotspotId: info.hotspotId,
        message: `${info.label} diletakkan semula.`,
      });
    };

    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - downPos.x;
      const dy = e.clientY - downPos.y;
      if (Math.hypot(dx, dy) > 6) return;

      const rect = canvas.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      inspectRaycaster.setFromCamera(pointerNdc, camera);
      const hits = inspectRaycaster.intersectObjects(diorama.interactables, true);
      if (hits.length > 0) {
        const hitHotspot = hits[0].object.userData.hotspotId as string | undefined;
        if (hitHotspot) {
          onSelectHotspotRef.current(hitHotspot);
        }
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError('Sambungan grafik 3D terganggu. Sila muat semula halaman.');
    };
    const onContextRestored = () => {
      setWebglError(null);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let elapsed = 0;
    const currentBg = studioBgColor.clone();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (sync && state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const renderFrame = (now: number) => {
      if (disposed) return;
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      elapsed += dt;

      const curParams = paramsRef.current;
      const curMetrics = metricsRef.current;
      const isAr = viewModeRef.current === 'ar';
      const viewW = container.clientWidth || window.innerWidth;
      const viewH = container.clientHeight || window.innerHeight;

      // Hand Tracking 3D Interaction (when enabled and Quiz modal isn't open)
      const hand = handStateRef.current;
      const handActive = handEnabledRef.current && !modalOpenRef.current;

      if (handActive && hand.detected) {
        if (!lastHandDetected) {
          lastHandDetected = true;
          setHandDetectedUi(true);
        }

        // Draw skeleton on PiP canvas in 3D mode
        const pipCanvas = pipSkeletonRef.current;
        if (pipCanvas && hand.landmarks) {
          const pCtx = pipCanvas.getContext('2d');
          if (pCtx) {
            drawHandSkeleton(
              pCtx,
              hand.landmarks,
              pipCanvas.width,
              pipCanvas.height,
              true,
              hand.isPinching
            );
          }
        }

        // Update 60fps floating Hand Cursor DOM position directly
        if (handCursorRef.current) {
          const cx = hand.cursorX * viewW;
          const cy = hand.cursorY * viewH;
          handCursorRef.current.style.opacity = '1';
          handCursorRef.current.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) translate(-50%, -50%)`;
        }

        _handNdc.set(hand.cursorX * 2 - 1, -(hand.cursorY * 2 - 1));
        pickRaycaster.setFromCamera(_handNdc, camera);

        if (currentGrabbedId) {
          // Move held object in 3D plane parallel to diorama floor
          const liftWorldY = diorama.root.position.y + 1.0 * diorama.root.scale.y;
          _dragPlane.constant = -liftWorldY;
          if (pickRaycaster.ray.intersectPlane(_dragPlane, _planeHit)) {
            diorama.root.worldToLocal(_planeHit);
            diorama.moveGrabbedPickable(_planeHit.x, _planeHit.z);
          }

          if (!hand.isPinching || hand.justReleased) {
            const released = diorama.releaseGrabbedPickable();
            currentGrabbedId = null;
            setHeldItemInfo(null);
            if (released) {
              evaluateReleaseAction(released);
            }
          }
        } else {
          // Hover pickable materials
          const hits = pickRaycaster.intersectObjects(diorama.pickableProxies, false);
          const hitId =
            hits.length > 0 && hits[0].object.parent?.visible
              ? (hits[0].object.userData.pickableId as PickableItemId)
              : null;

          if (hitId !== lastHoveredId) {
            lastHoveredId = hitId;
            diorama.setHoveredPickable(hitId);
            setHoveredItemLabel(hitId ? diorama.getPickableInfo(hitId)?.label ?? null : null);
          }

          if (hand.justPinched && hitId) {
            const info = diorama.getPickableInfo(hitId);
            currentGrabbedId = hitId;
            diorama.grabPickable(hitId);
            soundEngine.playTone('select');
            if (info) {
              setHeldItemInfo({
                id: info.id,
                label: info.label,
                hint: info.actionHint,
              });
            }
          }
        }
        onConsumePinchRef.current();
      } else {
        if (lastHandDetected) {
          lastHandDetected = false;
          setHandDetectedUi(false);
        }
        if (handCursorRef.current) {
          handCursorRef.current.style.opacity = '0';
        }
        if (lastHoveredId) {
          lastHoveredId = null;
          diorama.setHoveredPickable(null);
          setHoveredItemLabel(null);
        }
        if (currentGrabbedId) {
          const released = diorama.releaseGrabbedPickable();
          currentGrabbedId = null;
          setHeldItemInfo(null);
          if (released) evaluateReleaseAction(released);
        }
      }

      // Update diorama physics, rain, runoff & water height
      diorama.update(dt, elapsed, curParams, curMetrics, isSoftwareGl);

      // Update studio vs AR scene background/scale
      if (isAr) {
        scene.background = null;
        scene.fog = null;
        renderer.setClearColor(0x000000, 0);
        studioStage.visible = false;
        arReticle.visible = true;

        const targetScale = arScaleRef.current * 0.55;
        const damp = 1 - Math.exp(-8 * dt);
        const s = diorama.root.scale.x + (targetScale - diorama.root.scale.x) * damp;
        diorama.root.scale.setScalar(s);

        const gyroX = arGyroRef.current.enabled ? (arGyroRef.current.gamma / 25) * 0.25 : 0;
        const gyroZ = arGyroRef.current.enabled ? (arGyroRef.current.beta / 20) * 0.2 : 0;
        diorama.root.position.set(
          arOffsetRef.current.x + gyroX,
          arOffsetRef.current.y,
          arOffsetRef.current.z + gyroZ
        );
      } else {
        const stormNorm = curParams.rainIntensity / 120;
        currentBg.copy(studioBgColor).lerp(stormBgColor, stormNorm * 0.8);
        scene.background = currentBg;
        horizonFog.color.copy(currentBg);
        scene.fog = horizonFog;
        renderer.setClearColor(currentBg, 1);
        studioStage.visible = true;
        arReticle.visible = false;

        const damp = 1 - Math.exp(-8 * dt);
        const s = diorama.root.scale.x + (1.0 - diorama.root.scale.x) * damp;
        diorama.root.scale.setScalar(s);
        diorama.root.position.lerp(new THREE.Vector3(0, 0, 0), damp);
      }

      if (camTransitionRef.current.active) {
        const presetCfg = CAMERA_PRESETS[camTransitionRef.current.preset];
        _targetCamPos.set(...presetCfg.pos);
        _targetLookAt.set(...presetCfg.target);
        const camDamp = 1 - Math.exp(-5.5 * dt);
        camera.position.lerp(_targetCamPos, camDamp);
        controls.target.lerp(_targetLookAt, camDamp);
        if (
          camera.position.distanceTo(_targetCamPos) < 0.05 &&
          controls.target.distanceTo(_targetLookAt) < 0.04
        ) {
          camTransitionRef.current.active = false;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      // Project 3D Hotspot Anchors onto Screen Space DOM Pins
      const labelsVisible = showLabelsRef.current;
      for (const h of SCIENTIFIC_HOTSPOTS) {
        const el = pinRefs.current[h.id];
        if (!el) continue;
        if (!labelsVisible) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          continue;
        }
        _projVec.set(h.anchor[0], h.anchor[1], h.anchor[2]);
        _projVec.applyMatrix4(diorama.root.matrixWorld);
        _projVec.project(camera);

        if (_projVec.z > 1 || _projVec.z < -1) {
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
          continue;
        }

        const sx = (_projVec.x * 0.5 + 0.5) * viewW;
        const sy = (-_projVec.y * 0.5 + 0.5) * viewH;

        el.style.opacity = sx < 24 || sx > viewW - 24 || sy < 60 || sy > viewH - 90 ? '0.25' : '1';
        el.style.pointerEvents = 'auto';
        el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
      }
    };

    const tick = () => {
      if (disposed) return;
      renderFrame(performance.now());
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      tick();
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', stopCamTransition);
      controls.dispose();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      diorama.dispose();
      textures.dispose();
      studioStageGeo.dispose();
      studioStageMat.dispose();
      reticleGeo.dispose();
      reticleMat.dispose();
      renderer.dispose();
      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
    };
  }, []);

  const handleStartWebXr = async () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const nav = navigator as Navigator & {
      xr?: {
        requestSession: (mode: string, opts?: unknown) => Promise<XRSession>;
      };
    };
    if (!nav.xr) return;

    try {
      const session = await nav.xr.requestSession('immersive-ar', {
        optionalFeatures: ['local-floor', 'hit-test'],
      });
      await renderer.xr.setSession(session);
      setWebXrActive(true);
      session.addEventListener('end', () => {
        setWebXrActive(false);
      });
    } catch {
      // Fallback stays active
    }
  };

  const hasLiveBgCamera =
    viewMode === 'ar' &&
    ((handTrackingEnabled && handStream !== null) || fallbackCamState === 'active');

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950">
      {/* Live Camera Feed Layer for Passthrough AR Mode */}
      {viewMode === 'ar' && (
        <video
          ref={bgVideoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            handTrackingEnabled ? '-scale-x-100' : ''
          } ${hasLiveBgCamera ? 'opacity-100' : 'opacity-0'}`}
        />
      )}

      {/* Fallback AR Tabletop Surface Grid when device has no camera or permission denied */}
      {viewMode === 'ar' && !hasLiveBgCamera && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 50% 45%, #1e293b 0%, #0f172a 65%, #020617 100%)',
          }}
        >
          <div
            className="absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(56,189,248,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,189,248,0.22) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
        </div>
      )}

      {/* Dedicated Isolated WebGL Canvas Container */}
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full z-10 cursor-grab active:cursor-grabbing"
      />

      {/* 3D-Projected Semantic HTML Scientific Pins */}
      <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden">
        {SCIENTIFIC_HOTSPOTS.map((hotspot) => {
          const isSelected = selectedHotspotId === hotspot.id;
          const badgeTone =
            hotspot.category === 'Faktor Penyumbang'
              ? 'border-amber-400/70 bg-slate-900/95 text-amber-300'
              : hotspot.category === 'Langkah Mitigasi'
                ? 'border-emerald-400/70 bg-slate-900/95 text-emerald-300'
                : 'border-sky-400/70 bg-slate-900/95 text-sky-300';

          return (
            <button
              key={hotspot.id}
              ref={(el) => {
                pinRefs.current[hotspot.id] = el;
              }}
              type="button"
              onClick={() => onSelectHotspot(hotspot.id)}
              style={{ willChange: 'transform, opacity' }}
              className={`absolute top-0 left-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium shadow-lg transition-colors duration-150 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-sky-400 ${
                isSelected
                  ? 'border-white bg-sky-600 text-white shadow-sky-500/30'
                  : `${badgeTone} hover:bg-slate-800`
              }`}
            >
              <span className="font-mono-tabular text-[11px] opacity-80">
                {hotspot.number}
              </span>
              <span>{hotspot.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Floating 60fps Hand Tracking Reticle Cursor */}
      <div
        ref={handCursorRef}
        className="fixed top-0 left-0 z-40 pointer-events-none opacity-0 transition-opacity duration-150"
        style={{ willChange: 'transform, opacity' }}
      >
        <div
          className={`w-10 h-10 rounded-full border-2 flex items-center justify-center shadow-lg ${
            heldItemInfo
              ? 'border-emerald-400 bg-emerald-500/25 scale-90'
              : hoveredItemLabel
                ? 'border-amber-300 bg-amber-400/20 scale-110'
                : 'border-sky-400 bg-sky-500/15'
          }`}
        >
          <Hand
            className={`w-4 h-4 ${
              heldItemInfo
                ? 'text-emerald-300'
                : hoveredItemLabel
                  ? 'text-amber-200'
                  : 'text-sky-300'
            }`}
          />
        </div>
        {(heldItemInfo || hoveredItemLabel) && (
          <div className="mt-1.5 px-2.5 py-1 rounded-md bg-slate-950/95 border border-slate-700 text-[11px] font-medium text-white whitespace-nowrap text-center shadow-lg">
            {heldItemInfo
              ? `Memegang: ${heldItemInfo.label}`
              : `Cubit untuk ambil: ${hoveredItemLabel}`}
          </div>
        )}
      </div>

      {/* Top-Center AR / Hand Tracking Guidance Strip */}
      {(viewMode === 'ar' || handTrackingEnabled) && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 max-w-[92vw]">
          <div className="px-3 py-1.5 rounded-lg bg-slate-950/95 border border-slate-700/80 text-xs text-slate-200 shadow-lg flex items-center gap-2">
            <Hand
              className={`w-3.5 h-3.5 shrink-0 ${
                handDetectedUi ? 'text-emerald-400' : 'text-sky-400'
              }`}
            />
            <span>
              {handTrackingEnabled ? (
                handStatus === 'loading' ? (
                  'Memuatkan pengesan tangan kamera...'
                ) : handStatus === 'denied' || handStatus === 'unavailable' || handStatus === 'error' ? (
                  handErrorMessage ?? 'Kamera tangan tidak tersedia.'
                ) : heldItemInfo ? (
                  <strong className="text-emerald-300">{heldItemInfo.hint}</strong>
                ) : handDetectedUi ? (
                  'Tangan dikesan — Arahkan ke bahan 3D (sampah, pokok, blok telap air, bangunan) & cubit untuk ambil!'
                ) : (
                  'Tunjukkan tangan anda di hadapan kamera untuk mengambil bahan AR.'
                )
              ) : (
                'Mod AR Aktif — Aktifkan "Tangan Kamera" untuk mengambil bahan 3D dengan tangan.'
              )}
            </span>
          </div>

          {heldItemInfo?.id === 'debris-pack' && (
            <div className="px-2.5 py-1.5 rounded-lg bg-emerald-950/95 border border-emerald-500 text-xs font-semibold text-emerald-200 flex items-center gap-1.5 whitespace-nowrap">
              <Trash2 className="w-3.5 h-3.5" />
              <span>Tarik keluar dari parit</span>
            </div>
          )}

          {(heldItemInfo?.id === 'eco-tree' || heldItemInfo?.id === 'permeable-block') && (
            <div className="px-2.5 py-1.5 rounded-lg bg-emerald-950/95 border border-emerald-500 text-xs font-semibold text-emerald-200 flex items-center gap-1.5 whitespace-nowrap">
              <Trees className="w-3.5 h-3.5" />
              <span>Lepaskan di atas kawasan bandar</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => dioramaRef.current?.resetPickables()}
            title="Susun semula kedudukan bahan 3D"
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Susun Semula</span>
          </button>

          {viewMode === 'ar' && webXrSupported && !webXrActive && (
            <button
              type="button"
              onClick={handleStartWebXr}
              className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs shadow-lg transition-colors whitespace-nowrap shrink-0"
            >
              WebXR AR
            </button>
          )}
        </div>
      )}

      {/* Picture-in-Picture Hand Camera Preview (Shown in 3D mode when Hand Tracking is ON) */}
      {viewMode === '3d' && handTrackingEnabled && !modalOpen && handStream && (
        <div className="fixed bottom-4 right-4 z-30 w-44 h-32 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 shadow-2xl pointer-events-none">
          <video
            ref={pipVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover -scale-x-100 opacity-85"
          />
          <canvas
            ref={pipSkeletonRef}
            width={176}
            height={128}
            className="absolute inset-0 w-full h-full"
          />
          <div className="absolute bottom-1 left-1.5 px-1.5 py-0.5 rounded bg-slate-950/85 text-[10px] font-medium text-sky-300">
            {handDetectedUi ? 'Tangan Aktif' : 'Cari Tangan...'}
          </div>
        </div>
      )}

      {/* WebGL Error Fallback */}
      {webglError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950 p-6 text-center">
          <div className="max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold text-white mb-2">
              Paparan 3D Tidak Tersedia
            </h2>
            <p className="text-sm text-slate-300">{webglError}</p>
          </div>
        </div>
      )}
    </div>
  );
};
