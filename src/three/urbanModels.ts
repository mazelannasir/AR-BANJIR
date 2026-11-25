import * as THREE from 'three';
import { ProceduralTextureSet } from './proceduralTextures';
import { HydrologyMetrics, SimulationParams } from '../data/floodCurriculum';

// Pre-allocated scratch math objects (Zero GC inside render loop)
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export type PickableItemId =
  | 'debris-pack'
  | 'eco-tree'
  | 'permeable-block'
  | 'sky-tower'
  | 'urban-car';

export interface PickableItemInfo {
  id: PickableItemId;
  label: string;
  actionHint: string;
  hotspotId: string;
}

export interface UrbanDioramaHandle {
  root: THREE.Group;
  interactables: THREE.Object3D[];
  pickableProxies: THREE.Object3D[];
  getPickableInfo: (id: PickableItemId) => PickableItemInfo | undefined;
  setHoveredPickable: (id: PickableItemId | null) => void;
  grabPickable: (id: PickableItemId) => void;
  moveGrabbedPickable: (localX: number, localZ: number) => void;
  releaseGrabbedPickable: () => {
    id: PickableItemId;
    localX: number;
    localZ: number;
  } | null;
  resetPickables: () => void;
  update: (
    dt: number,
    elapsed: number,
    params: SimulationParams,
    metrics: HydrologyMetrics,
    isSoftwareGl: boolean
  ) => void;
  dispose: () => void;
}

function attachHotspotTag(obj: THREE.Object3D, hotspotId: string) {
  obj.userData.hotspotId = hotspotId;
  obj.traverse((child) => {
    child.userData.hotspotId = hotspotId;
    child.layers.enable(1);
  });
}

function createContactShadow(
  sizeX: number,
  sizeZ: number,
  texture: THREE.CanvasTexture
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(sizeX, sizeZ);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.012;
  return mesh;
}

function createSkyscraper(
  width: number,
  depth: number,
  height: number,
  accentHex: number,
  textures: ProceduralTextureSet
): THREE.Group {
  const group = new THREE.Group();

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.85,
    metalness: 0.05,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    map: textures.buildingFacadeMap,
    emissiveMap: textures.buildingEmissiveMap,
    emissive: new THREE.Color(0xfffbeb),
    emissiveIntensity: 0.45,
    roughness: 0.16,
    metalness: 0.35,
    clearcoat: 0.7,
    clearcoatRoughness: 0.15,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    roughness: 0.42,
    metalness: 0.65,
  });

  // 1. Podium base
  const podiumH = 0.42;
  const podium = new THREE.Mesh(
    new THREE.BoxGeometry(width * 1.1, podiumH, depth * 1.1),
    concreteMat
  );
  podium.position.y = podiumH / 2;
  podium.castShadow = true;
  podium.receiveShadow = true;
  group.add(podium);

  // 2. Main glazed shaft
  const shaftH = height - podiumH;
  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(width, shaftH, depth),
    glassMat
  );
  shaft.position.y = podiumH + shaftH / 2;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  group.add(shaft);

  // 3. Structural corner pilasters (4 parts)
  const pilasterGeo = new THREE.BoxGeometry(0.11, shaftH + 0.06, 0.11);
  const offsets: [number, number][] = [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [-width / 2, depth / 2],
    [width / 2, depth / 2],
  ];
  for (const [ox, oz] of offsets) {
    const pil = new THREE.Mesh(pilasterGeo, concreteMat);
    pil.position.set(ox, podiumH + shaftH / 2, oz);
    pil.castShadow = true;
    group.add(pil);
  }

  // 4. Rooftop parapet & crown
  const parapet = new THREE.Mesh(
    new THREE.BoxGeometry(width * 1.04, 0.12, depth * 1.04),
    trimMat
  );
  parapet.position.y = height + 0.06;
  parapet.castShadow = true;
  group.add(parapet);

  // 5. Rooftop HVAC / Mechanical Penthouse
  const mech = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.46, 0.24, depth * 0.46),
    concreteMat
  );
  mech.position.set(-width * 0.12, height + 0.24, 0);
  mech.castShadow = true;
  group.add(mech);

  // 6. Communications mast / spire
  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.038, 0.55, 8),
    trimMat
  );
  spire.position.set(width * 0.2, height + 0.39, depth * 0.15);
  group.add(spire);

  // 7. Grounding contact shadow
  group.add(createContactShadow(width * 1.5, depth * 1.5, textures.contactShadowMap));

  return group;
}

function createShophouse(
  width: number,
  depth: number,
  height: number,
  wallHex: number,
  roofHex: number,
  textures: ProceduralTextureSet
): THREE.Group {
  const group = new THREE.Group();

  const wallMat = new THREE.MeshStandardMaterial({
    color: wallHex,
    roughness: 0.82,
    metalness: 0.04,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: roofHex,
    roughness: 0.55,
    metalness: 0.2,
  });
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: 0xfef3c7,
    emissiveIntensity: 0.35,
    roughness: 0.2,
    metalness: 0.4,
  });

  // 1. Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMat);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // 2. Five-foot-way canopy awning
  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(width * 1.04, 0.06, depth * 0.32),
    roofMat
  );
  canopy.position.set(0, height * 0.42, depth / 2 + depth * 0.12);
  canopy.rotation.x = 0.18;
  canopy.castShadow = true;
  group.add(canopy);

  // 3. Pitched roof (extruded prism-like wedge via 4-sided cone rotated 45 deg)
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-width / 2 - 0.06, 0);
  roofShape.lineTo(width / 2 + 0.06, 0);
  roofShape.lineTo(0, 0.36);
  roofShape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: depth + 0.1,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  roofGeo.translate(0, 0, -(depth + 0.1) / 2);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = height;
  roof.castShadow = true;
  group.add(roof);

  // 4. Upper-floor window strip
  const winStrip = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.72, height * 0.28, depth + 0.03),
    windowMat
  );
  winStrip.position.y = height * 0.72;
  group.add(winStrip);

  // 5. Contact shadow
  group.add(createContactShadow(width * 1.35, depth * 1.45, textures.contactShadowMap));

  return group;
}

function createTree(scale = 1, textures: ProceduralTextureSet): THREE.Group {
  const group = new THREE.Group();

  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x5c4033,
    roughness: 0.94,
    metalness: 0.02,
  });
  const leafMatA = new THREE.MeshStandardMaterial({
    color: 0x2e7d32,
    roughness: 0.74,
    metalness: 0.0,
  });
  const leafMatB = new THREE.MeshStandardMaterial({
    color: 0x43a047,
    roughness: 0.68,
    metalness: 0.0,
  });

  // 1. Flared root collar
  const rootBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.16, 8), barkMat);
  rootBase.position.y = 0.08;
  rootBase.castShadow = true;
  group.add(rootBase);

  // 2. Main trunk
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 0.52, 8), barkMat);
  trunk.position.y = 0.36;
  trunk.castShadow = true;
  group.add(trunk);

  // 3. Branch fork
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, 0.32, 6), barkMat);
  branch.position.set(0.08, 0.56, 0.04);
  branch.rotation.z = -0.55;
  branch.castShadow = true;
  group.add(branch);

  // 4. Three layered foliage clusters
  const crown1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), leafMatA);
  crown1.position.set(0, 0.78, 0);
  crown1.castShadow = true;
  crown1.receiveShadow = true;
  group.add(crown1);

  const crown2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), leafMatB);
  crown2.position.set(0.16, 0.68, 0.1);
  crown2.castShadow = true;
  group.add(crown2);

  const crown3 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), leafMatB);
  crown3.position.set(-0.14, 0.66, -0.09);
  crown3.castShadow = true;
  group.add(crown3);

  group.add(createContactShadow(0.95, 0.95, textures.contactShadowMap));
  group.scale.setScalar(scale);

  return group;
}

function createCar(bodyColor: number, textures: ProceduralTextureSet): {
  group: THREE.Group;
  hazardLights: THREE.Mesh[];
} {
  const group = new THREE.Group();
  const hazardLights: THREE.Mesh[] = [];

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: bodyColor,
    roughness: 0.25,
    metalness: 0.6,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
  });
  const cabinGlassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.12,
    metalness: 0.8,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.88,
    metalness: 0.05,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.28,
    metalness: 0.85,
  });

  // 1. Lower chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.11, 0.62), bodyMat);
  chassis.position.y = 0.1;
  chassis.castShadow = true;
  group.add(chassis);

  // 2. Cabin roof
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.1, 0.34), cabinGlassMat);
  cabin.position.set(0, 0.19, -0.03);
  cabin.castShadow = true;
  group.add(cabin);

  // 3. Wheels (4x with metallic hubcaps)
  const wheelGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.04, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.044, 8);
  rimGeo.rotateZ(Math.PI / 2);
  const wheelCoords: [number, number][] = [
    [-0.16, 0.18],
    [0.16, 0.18],
    [-0.16, -0.18],
    [0.16, -0.18],
  ];
  for (const [wx, wz] of wheelCoords) {
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    tire.position.set(wx, 0.058, wz);
    group.add(tire);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(wx, 0.058, wz);
    group.add(rim);
  }

  // 4. Hazard / Headlight bulbs
  const hazardMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.15,
    roughness: 0.2,
  });
  for (const sx of [-0.11, 0.11]) {
    const hFront = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.02), hazardMat);
    hFront.position.set(sx, 0.11, 0.315);
    group.add(hFront);
    hazardLights.push(hFront);
  }

  group.add(createContactShadow(0.55, 0.85, textures.contactShadowMap));
  return { group, hazardLights };
}

function createStreetlamp(): THREE.Group {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.45,
    metalness: 0.78,
  });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xfde68a,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });

  // 1. Base flange
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.1, 8), poleMat);
  base.position.y = 0.05;
  group.add(base);

  // 2. Column pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.032, 0.95, 8), poleMat);
  pole.position.y = 0.52;
  pole.castShadow = true;
  group.add(pole);

  // 3. Outreach arm
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.025, 0.025), poleMat);
  arm.position.set(0.11, 0.98, 0);
  group.add(arm);

  // 4. Luminaire housing + glowing lens
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.07), poleMat);
  head.position.set(0.22, 0.97, 0);
  group.add(head);

  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.015, 0.05), lampMat);
  bulb.position.set(0.22, 0.95, 0);
  group.add(bulb);

  return group;
}

export function createUrbanFloodDiorama(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean
): UrbanDioramaHandle {
  const root = new THREE.Group();
  const interactables: THREE.Object3D[] = [];

  // =========================================================================
  // 1. GEOLOGICAL BASE BLOCK & SOIL CUTAWAY
  // =========================================================================
  const soilMat = new THREE.MeshStandardMaterial({
    map: textures.soilCutawayMap,
    roughness: 0.92,
    metalness: 0.02,
  });
  const baseBlock = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.9, 6.8), soilMat);
  baseBlock.position.set(0, -0.45, 0);
  baseBlock.receiveShadow = true;
  root.add(baseBlock);

  // Impervious urban plaza vs Permeable eco-pavers surface
  const plazaMat = new THREE.MeshStandardMaterial({
    map: textures.concreteMap,
    roughness: 0.88,
    metalness: 0.04,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const urbanPlaza = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.06, 6.72), plazaMat);
  urbanPlaza.position.set(-1.45, 0.03, 0);
  urbanPlaza.receiveShadow = true;
  attachHotspotTag(urbanPlaza, 'urban-impervious');
  root.add(urbanPlaza);
  interactables.push(urbanPlaza);

  // Asphalt main street running along Z axis at x = 0.05
  const roadMat = new THREE.MeshStandardMaterial({
    map: textures.asphaltMap,
    roughnessMap: textures.asphaltRoughness,
    roughness: 0.78,
    metalness: 0.05,
  });
  textures.asphaltMap.repeat.set(1, 4);
  textures.asphaltRoughness.repeat.set(1, 4);
  const mainRoad = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.075, 6.74), roadMat);
  mainRoad.position.set(0.15, 0.04, 0);
  mainRoad.receiveShadow = true;
  attachHotspotTag(mainRoad, 'surface-runoff');
  root.add(mainRoad);
  interactables.push(mainRoad);

  // Cross-street along X axis at z = 0.4
  const crossRoad = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.072, 1.05), roadMat);
  crossRoad.position.set(-1.95, 0.038, 0.4);
  crossRoad.receiveShadow = true;
  attachHotspotTag(crossRoad, 'surface-runoff');
  root.add(crossRoad);

  // =========================================================================
  // 2. RIVER CHANNEL & EMBANKMENT (X = 2.25 to 4.55)
  // =========================================================================
  const bankMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.85,
    metalness: 0.08,
  });
  const greenBankMat = new THREE.MeshStandardMaterial({
    color: 0x2f6f3e,
    roughness: 0.9,
    metalness: 0.0,
  });

  // Left concrete/riparian riverbank
  const leftBank = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.24, 6.76), greenBankMat);
  leftBank.position.set(2.05, 0.02, 0);
  leftBank.receiveShadow = true;
  root.add(leftBank);

  // Riverbed floor
  const riverBed = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.08, 6.76), bankMat);
  riverBed.position.set(3.25, -0.35, 0);
  riverBed.receiveShadow = true;
  attachHotspotTag(riverBed, 'river-flood');
  root.add(riverBed);

  // Right outer embankment
  const rightBank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.56, 6.76), greenBankMat);
  rightBank.position.set(4.52, -0.05, 0);
  rightBank.receiveShadow = true;
  root.add(rightBank);

  // =========================================================================
  // 3. STORM DRAINAGE CHANNEL, GRATES, CULVERT PIPE & DEBRIS
  // =========================================================================
  const drainGroup = new THREE.Group();
  const drainWallMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.86,
    metalness: 0.1,
  });
  const grateMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.34,
    metalness: 0.78,
  });

  // Concrete roadside drain trough at x = 1.02
  const drainFloor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 6.72), drainWallMat);
  drainFloor.position.set(1.02, -0.1, 0);
  drainGroup.add(drainFloor);

  const drainWallL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 6.72), drainWallMat);
  drainWallL.position.set(0.87, -0.01, 0);
  drainGroup.add(drainWallL);

  const drainWallR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 6.72), drainWallMat);
  drainWallR.position.set(1.17, -0.01, 0);
  drainGroup.add(drainWallR);

  // Metal storm grates along the channel
  for (let z = -2.7; z <= 2.7; z += 0.9) {
    const grate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.55), grateMat);
    grate.position.set(1.02, 0.065, z);
    drainGroup.add(grate);
  }

  // Cutaway underground culvert pipe discharging into river
  const culvertPipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 1.15, 16, 1, true),
    drainWallMat
  );
  culvertPipe.rotation.z = Math.PI / 2;
  culvertPipe.position.set(1.62, -0.14, 1.45);
  drainGroup.add(culvertPipe);

  // Culvert water stream jet
  const culvertJetMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.82,
  });
  const culvertJet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.11, 0.95, 12),
    culvertJetMat
  );
  culvertJet.rotation.z = Math.PI / 2;
  culvertJet.position.set(1.75, -0.14, 1.45);
  drainGroup.add(culvertJet);

  // Clogged trash & sediment debris cluster (pickable with hand!)
  const debrisGroup = new THREE.Group();
  const debrisColors = [0xef4444, 0xfbbf24, 0x94a3b8, 0x78350f, 0xe2e8f0];
  for (let i = 0; i < 16; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: debrisColors[i % debrisColors.length],
      roughness: 0.78,
      metalness: 0.05,
    });
    const piece = new THREE.Mesh(
      i % 2 === 0
        ? new THREE.BoxGeometry(0.13, 0.1, 0.16)
        : new THREE.DodecahedronGeometry(0.085, 0),
      mat
    );
    piece.position.set(
      ((i % 3) - 1) * 0.07,
      0.06 + (i % 2) * 0.045,
      -1.2 + i * 0.16
    );
    piece.rotation.set(i * 0.7, i * 1.1, 0);
    debrisGroup.add(piece);
  }
  debrisGroup.position.set(1.02, 0.06, 0);
  root.add(debrisGroup);

  attachHotspotTag(drainGroup, 'drainage-system');
  root.add(drainGroup);
  interactables.push(drainGroup);

  // =========================================================================
  // 4. URBAN BUILDINGS (Core + Density-Controlled Secondary Towers)
  // =========================================================================
  const coreBuildings = [
    { x: -2.4, z: -1.75, w: 1.05, d: 1.05, h: 2.35, accent: 0x0284c7, type: 'tower' },
    { x: -1.15, z: -2.1, w: 0.85, d: 0.85, h: 1.75, accent: 0x0ea5e9, type: 'tower' },
    { x: -3.7, z: -1.9, w: 0.95, d: 0.95, h: 1.45, accent: 0xf59e0b, type: 'shop' },
    { x: -1.2, z: 1.85, w: 0.9, d: 0.85, h: 1.05, accent: 0xef4444, type: 'shop' },
  ];

  // Secondary buildings that grow/appear when urbanDensity increases
  const dynamicBuildings: { mesh: THREE.Group; threshold: number }[] = [];
  const extraSpecs = [
    { x: -3.75, z: -0.6, w: 0.85, d: 0.85, h: 1.85, accent: 0x38bdf8, type: 'tower', threshold: 35 },
    { x: -2.35, z: -0.55, w: 0.8, d: 0.75, h: 1.35, accent: 0xf97316, type: 'shop', threshold: 50 },
    { x: -1.1, z: -0.85, w: 0.78, d: 0.78, h: 1.95, accent: 0x0ea5e9, type: 'tower', threshold: 65 },
    { x: -3.85, z: 1.9, w: 0.88, d: 0.82, h: 1.6, accent: 0x6366f1, type: 'tower', threshold: 78 },
  ];

  const pickableTargets: Record<string, THREE.Object3D> = {};

  for (let idx = 0; idx < coreBuildings.length; idx++) {
    const b = coreBuildings[idx];
    const grp =
      b.type === 'tower'
        ? createSkyscraper(b.w, b.d, b.h, b.accent, textures)
        : createShophouse(b.w, b.d, b.h, 0xe2e8f0, b.accent, textures);
    grp.position.set(b.x, 0.06, b.z);
    attachHotspotTag(grp, 'urban-impervious');
    root.add(grp);
    interactables.push(grp);
    if (idx === 0) {
      pickableTargets['sky-tower'] = grp;
    }
  }

  for (const b of extraSpecs) {
    const grp =
      b.type === 'tower'
        ? createSkyscraper(b.w, b.d, b.h, b.accent, textures)
        : createShophouse(b.w, b.d, b.h, 0xf1f5f9, b.accent, textures);
    grp.position.set(b.x, 0.06, b.z);
    attachHotspotTag(grp, 'urban-impervious');
    root.add(grp);
    interactables.push(grp);
    dynamicBuildings.push({ mesh: grp, threshold: b.threshold });
  }

  // =========================================================================
  // 5. GREEN MITIGATION ZONE: RETENTION POND, RAIN GARDEN & URBAN TREES
  // =========================================================================
  const mitigationGroup = new THREE.Group();

  // Retention Pond (Kolam Takungan Banjir) at (-2.75, 0.06, 2.05)
  const stoneEmbankMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.88,
    metalness: 0.05,
  });
  const pondRim = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.15, 0.14, 24, 1, true),
    stoneEmbankMat
  );
  pondRim.position.set(-2.65, 0.1, 2.05);
  mitigationGroup.add(pondRim);

  const pondBasinMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a5f,
    roughness: 0.75,
    metalness: 0.1,
  });
  const pondFloor = new THREE.Mesh(new THREE.CircleGeometry(1.04, 24), pondBasinMat);
  pondFloor.rotation.x = -Math.PI / 2;
  pondFloor.position.set(-2.65, 0.075, 2.05);
  mitigationGroup.add(pondFloor);

  const pondWaterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0ea5e9,
    roughness: 0.12,
    metalness: 0.05,
    transparent: true,
    opacity: 0.82,
    clearcoat: 0.9,
  });
  const pondWater = new THREE.Mesh(new THREE.CircleGeometry(1.0, 24), pondWaterMat);
  pondWater.rotation.x = -Math.PI / 2;
  pondWater.position.set(-2.65, 0.11, 2.05);
  mitigationGroup.add(pondWater);

  // Bioswale grass strip along road
  const bioswaleMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    roughness: 0.88,
  });
  const bioswale = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 2.4), bioswaleMat);
  bioswale.position.set(-0.72, 0.075, 2.05);
  mitigationGroup.add(bioswale);

  // Green mitigation trees (around pond + riparian buffer)
  const mitigationTreeCoords: [number, number, number][] = [
    [-3.85, 2.75, 1.15],
    [-1.65, 2.75, 0.95],
    [-3.6, 1.25, 1.0],
    [-0.72, 1.4, 0.8],
    [-0.72, 2.75, 0.85],
    [1.98, -2.4, 0.92],
    [1.98, -0.6, 1.0],
    [1.98, 2.2, 0.9],
  ];
  for (const [tx, tz, sc] of mitigationTreeCoords) {
    const tree = createTree(sc, textures);
    tree.position.set(tx, 0.06, tz);
    mitigationGroup.add(tree);
  }

  attachHotspotTag(mitigationGroup, 'green-mitigation');
  root.add(mitigationGroup);
  interactables.push(mitigationGroup);

  // Always-visible riparian baseline trees (2 trees on far bank)
  const baseTree1 = createTree(1.05, textures);
  baseTree1.position.set(4.5, 0.22, -2.1);
  attachHotspotTag(baseTree1, 'river-flood');
  root.add(baseTree1);

  const baseTree2 = createTree(0.95, textures);
  baseTree2.position.set(4.5, 0.22, 1.8);
  attachHotspotTag(baseTree2, 'river-flood');
  root.add(baseTree2);

  // =========================================================================
  // 6. URBAN VEHICLES & STREETLAMPS
  // =========================================================================
  const car1 = createCar(0xef4444, textures);
  car1.group.position.set(0.38, 0.078, -1.6);
  root.add(car1.group);

  const car2 = createCar(0xf8fafc, textures);
  car2.group.position.set(-0.12, 0.078, 1.3);
  car2.group.rotation.y = Math.PI;
  root.add(car2.group);

  const lampPositions: [number, number, number][] = [
    [-0.65, -2.3, 0],
    [-0.65, -0.4, 0],
    [-0.65, 1.5, 0],
  ];
  for (const [lx, lz, rot] of lampPositions) {
    const lamp = createStreetlamp();
    lamp.position.set(lx, 0.06, lz);
    lamp.rotation.y = rot;
    root.add(lamp);
  }

  // =========================================================================
  // 6B. AR PICKABLE MATERIAL PROPS (Tree Sapling & Permeable Eco-Paver Block)
  // =========================================================================
  const ecoTreeProp = createTree(1.15, textures);
  ecoTreeProp.position.set(-3.75, 0.06, 2.85);
  attachHotspotTag(ecoTreeProp, 'green-mitigation');
  root.add(ecoTreeProp);
  interactables.push(ecoTreeProp);

  const permeableBlockProp = new THREE.Group();
  const paverBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.12, 0.75),
    new THREE.MeshStandardMaterial({
      map: textures.permeablePaverMap,
      roughness: 0.72,
      metalness: 0.05,
    })
  );
  paverBase.position.y = 0.06;
  paverBase.castShadow = true;
  permeableBlockProp.add(paverBase);
  const paverFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 0.05, 0.82),
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.45,
      metalness: 0.25,
    })
  );
  paverFrame.position.y = 0.025;
  permeableBlockProp.add(paverFrame);
  permeableBlockProp.position.set(-2.35, 0.06, 2.9);
  attachHotspotTag(permeableBlockProp, 'green-mitigation');
  root.add(permeableBlockProp);
  interactables.push(permeableBlockProp);

  // Register all 5 Pickable AR Materials with generous Layer-2 Hitboxes
  const pickableProxies: THREE.Object3D[] = [];
  const pickableRegistry = new Map<
    PickableItemId,
    {
      info: PickableItemInfo;
      group: THREE.Object3D;
      homePos: THREE.Vector3;
      targetPos: THREE.Vector3;
    }
  >();

  const registerPickable = (
    info: PickableItemInfo,
    group: THREE.Object3D,
    hitSize: [number, number, number],
    hitOffsetY: number
  ) => {
    const hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(hitSize[0], hitSize[1], hitSize[2]),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitbox.position.y = hitOffsetY;
    hitbox.layers.set(2);
    hitbox.userData.pickableId = info.id;
    hitbox.userData.hotspotId = info.hotspotId;
    group.add(hitbox);
    pickableProxies.push(hitbox);

    pickableRegistry.set(info.id, {
      info,
      group,
      homePos: group.position.clone(),
      targetPos: group.position.clone(),
    });
  };

  registerPickable(
    {
      id: 'debris-pack',
      label: 'Sampah Penyumbat Parit',
      actionHint: 'Tarik keluar dari parit untuk membersihkan saluran!',
      hotspotId: 'drainage-system',
    },
    debrisGroup,
    [0.65, 0.65, 2.6],
    0.2
  );

  registerPickable(
    {
      id: 'eco-tree',
      label: 'Pokok Penyerap Air',
      actionHint: 'Letakkan di kawasan bandar untuk tambah resapan tanah.',
      hotspotId: 'green-mitigation',
    },
    ecoTreeProp,
    [0.85, 1.15, 0.85],
    0.55
  );

  registerPickable(
    {
      id: 'permeable-block',
      label: 'Blok Turapan Telap Air',
      actionHint: 'Letakkan di plaza konkrit untuk aktifkan Langkah Hijau.',
      hotspotId: 'green-mitigation',
    },
    permeableBlockProp,
    [0.95, 0.55, 0.95],
    0.25
  );

  if (pickableTargets['sky-tower']) {
    registerPickable(
      {
        id: 'sky-tower',
        label: 'Menara Konkrit Bandar',
        actionHint: 'Angkat untuk periksa kesan permukaan tidak telap air.',
        hotspotId: 'urban-impervious',
      },
      pickableTargets['sky-tower'],
      [1.25, 2.5, 1.25],
      1.2
    );
  }

  registerPickable(
    {
      id: 'urban-car',
      label: 'Kenderaan Bandar',
      actionHint: 'Alihkan kenderaan daripada laluan air banjir!',
      hotspotId: 'surface-runoff',
    },
    car1.group,
    [0.65, 0.55, 0.95],
    0.25
  );

  // Glowing 3D Hover / Grab Halo Ring
  const haloMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.6, 32),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  haloMesh.rotation.x = -Math.PI / 2;
  haloMesh.visible = false;
  root.add(haloMesh);

  // =========================================================================
  // 7. DYNAMIC RIVER WATER & URBAN FLOODWATER PLANE
  // =========================================================================
  const riverWaterGeo = new THREE.PlaneGeometry(2.14, 6.72, 24, 36);
  riverWaterGeo.rotateX(-Math.PI / 2);

  const waterShaderUniforms = {
    uTime: { value: 0 },
    uWaveAmp: { value: 0.025 },
  };

  const riverWaterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0284c7,
    roughness: 0.14,
    metalness: 0.08,
    bumpMap: textures.waterBumpMap,
    bumpScale: 0.03,
    transparent: true,
    opacity: 0.86,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
  });

  riverWaterMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterShaderUniforms.uTime;
    shader.uniforms.uWaveAmp = waterShaderUniforms.uWaveAmp;
    shader.vertexShader =
      `uniform float uTime;\nuniform float uWaveAmp;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      float w1 = sin(transformed.z * 2.4 + uTime * 3.2) * uWaveAmp;
      float w2 = cos(transformed.x * 3.1 - uTime * 2.5) * uWaveAmp * 0.6;
      transformed.y += w1 + w2;
      `
    );
  };

  const riverWaterMesh = new THREE.Mesh(riverWaterGeo, riverWaterMat);
  riverWaterMesh.position.set(3.25, -0.15, 0);
  riverWaterMesh.receiveShadow = true;
  attachHotspotTag(riverWaterMesh, 'river-flood');
  root.add(riverWaterMesh);
  interactables.push(riverWaterMesh);

  // Urban Street Floodwater sheet (expands/rises above road y=0.075 when flooding)
  const floodSheetGeo = new THREE.PlaneGeometry(6.85, 6.72, 24, 24);
  floodSheetGeo.rotateX(-Math.PI / 2);
  const floodSheetMat = new THREE.MeshPhysicalMaterial({
    color: 0x856a47, // realistic muddy urban floodwater
    roughness: 0.18,
    metalness: 0.05,
    bumpMap: textures.waterBumpMap,
    bumpScale: 0.025,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    clearcoat: 0.8,
  });
  floodSheetMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterShaderUniforms.uTime;
    shader.vertexShader = `uniform float uTime;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      transformed.y += sin(transformed.x * 2.2 + uTime * 2.6) * 0.008 + cos(transformed.z * 2.8 - uTime * 2.1) * 0.006;
      `
    );
  };
  const floodSheetMesh = new THREE.Mesh(floodSheetGeo, floodSheetMat);
  floodSheetMesh.position.set(-0.9, 0.06, 0);
  floodSheetMesh.visible = false;
  attachHotspotTag(floodSheetMesh, 'river-flood');
  root.add(floodSheetMesh);

  // =========================================================================
  // 8. STORM CLOUDS, INSTANCED RAIN & SURFACE RUNOFF STREAKS
  // =========================================================================
  const cloudGroup = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.95,
    metalness: 0.0,
    transparent: true,
    opacity: 0.88,
  });

  const cloudPuffs: [number, number, number, number][] = [
    [-1.5, 4.95, -0.9, 0.85],
    [-0.6, 5.15, -0.5, 1.05],
    [0.45, 5.05, -0.8, 0.95],
    [1.4, 4.9, -0.2, 0.78],
    [-0.1, 4.9, 0.4, 0.85],
    [-1.1, 4.85, 0.5, 0.72],
    [0.9, 4.88, 0.6, 0.76],
  ];
  for (const [cx, cy, cz, rad] of cloudPuffs) {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 2), cloudMat);
    puff.position.set(cx, cy, cz);
    puff.scale.set(1.25, 0.65, 1.05);
    cloudGroup.add(puff);
  }
  attachHotspotTag(cloudGroup, 'heavy-rain');
  root.add(cloudGroup);
  interactables.push(cloudGroup);

  // Instanced Rain Streaks (750 particles)
  const RAIN_COUNT = isSoftwareGl ? 320 : 750;
  const rainGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.36, 4);
  const rainMat = new THREE.MeshBasicMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.6,
  });
  const rainInstanced = new THREE.InstancedMesh(rainGeo, rainMat, RAIN_COUNT);
  rainInstanced.frustumCulled = false;

  const rainSeeds = new Float32Array(RAIN_COUNT * 4); // x, y, z, speed
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainSeeds[i * 4] = (Math.random() - 0.5) * 8.8;
    rainSeeds[i * 4 + 1] = Math.random() * 5.0;
    rainSeeds[i * 4 + 2] = (Math.random() - 0.5) * 6.4;
    rainSeeds[i * 4 + 3] = 5.5 + Math.random() * 3.5;
  }
  root.add(rainInstanced);

  // Instanced Surface Runoff Particles (160 glowing blue/cyan droplets racing across pavement into drain)
  const RUNOFF_COUNT = 160;
  const runoffGeo = new THREE.BoxGeometry(0.14, 0.025, 0.045);
  const runoffMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
  });
  const runoffInstanced = new THREE.InstancedMesh(runoffGeo, runoffMat, RUNOFF_COUNT);
  runoffInstanced.frustumCulled = false;

  const runoffSeeds = new Float32Array(RUNOFF_COUNT * 3); // progress(0..1), zLane, speed
  for (let i = 0; i < RUNOFF_COUNT; i++) {
    runoffSeeds[i * 3] = Math.random();
    runoffSeeds[i * 3 + 1] = (Math.random() - 0.5) * 6.1;
    runoffSeeds[i * 3 + 2] = 0.28 + Math.random() * 0.45;
  }
  root.add(runoffInstanced);

  // Smoothed state variables & Pickable Grab State
  let currentWaterY = -0.15;
  let currentFloodY = 0.05;
  let currentFloodOpacity = 0;
  let currentMitigationScale = 0.001;
  let currentCloudDarkness = 0.2;

  let hoveredPickableId: PickableItemId | null = null;
  let grabbedPickableId: PickableItemId | null = null;

  const setHoveredPickable = (id: PickableItemId | null) => {
    hoveredPickableId = id;
  };

  const grabPickable = (id: PickableItemId) => {
    const item = pickableRegistry.get(id);
    if (!item) return;
    grabbedPickableId = id;
    item.targetPos.y = 1.15;
  };

  const moveGrabbedPickable = (localX: number, localZ: number) => {
    if (!grabbedPickableId) return;
    const item = pickableRegistry.get(grabbedPickableId);
    if (!item) return;
    item.targetPos.x = THREE.MathUtils.clamp(localX, -4.4, 4.4);
    item.targetPos.z = THREE.MathUtils.clamp(localZ, -3.2, 3.2);
    item.targetPos.y = 1.15;
  };

  const releaseGrabbedPickable = () => {
    if (!grabbedPickableId) return null;
    const id = grabbedPickableId;
    const item = pickableRegistry.get(id);
    grabbedPickableId = null;
    if (!item) return null;
    const localX = item.targetPos.x;
    const localZ = item.targetPos.z;
    // Settle gracefully onto ground height (0.06 or road 0.078)
    item.targetPos.y = id === 'urban-car' ? 0.078 : 0.06;
    return { id, localX, localZ };
  };

  const resetPickables = () => {
    grabbedPickableId = null;
    pickableRegistry.forEach((item) => {
      item.targetPos.copy(item.homePos);
    });
  };

  const update = (
    dt: number,
    elapsed: number,
    params: SimulationParams,
    metrics: HydrologyMetrics
  ) => {
    const dampK = 1 - Math.exp(-5.0 * dt);
    const grabDampK = 1 - Math.exp(-12.0 * dt);
    waterShaderUniforms.uTime.value = elapsed;
    textures.waterBumpMap.offset.y = -(elapsed * 0.14) % 1;
    textures.waterBumpMap.offset.x = (elapsed * 0.03) % 1;

    // 1. Plaza texture swap (sealed concrete vs permeable eco-paver)
    const desiredMap = params.greenMitigation
      ? textures.permeablePaverMap
      : textures.concreteMap;
    if (plazaMat.map !== desiredMap) {
      plazaMat.map = desiredMap;
      plazaMat.needsUpdate = true;
    }

    // 2. Dynamic building density scaling (smooth growth)
    for (const b of dynamicBuildings) {
      const active = params.urbanDensity >= b.threshold;
      const targetScaleY = active ? 1 : 0.001;
      b.mesh.scale.y += (targetScaleY - b.mesh.scale.y) * dampK;
      b.mesh.visible = b.mesh.scale.y > 0.02;
    }

    // 3. Green Mitigation group smooth pop-in/out
    const targetMitScale = params.greenMitigation ? 1 : 0.001;
    currentMitigationScale += (targetMitScale - currentMitigationScale) * dampK;
    mitigationGroup.scale.set(1, currentMitigationScale, 1);
    mitigationGroup.visible = currentMitigationScale > 0.02;

    if (mitigationGroup.visible) {
      pondWater.position.y = 0.095 + (params.rainIntensity / 120) * 0.065;
    }

    // 4. Drainage debris visibility & position (kept in drain when clogged, or movable!)
    const debrisItem = pickableRegistry.get('debris-pack');
    if (grabbedPickableId !== 'debris-pack') {
      debrisGroup.visible = params.drainageClogged;
      if (params.drainageClogged && debrisItem) {
        debrisItem.targetPos.copy(debrisItem.homePos);
      }
    } else {
      debrisGroup.visible = true;
    }

    const drainFlowScale =
      params.rainIntensity > 4
        ? (params.drainageClogged ? 0.22 : 0.95) * (0.3 + (params.rainIntensity / 120) * 0.7)
        : 0.01;
    culvertJet.scale.set(1, drainFlowScale, drainFlowScale);
    culvertJet.visible = drainFlowScale > 0.04;

    // 5. River level & Urban floodwater sheet
    const targetRiverY = -0.26 + metrics.riverLevelRatio * 0.44;
    currentWaterY += (targetRiverY - currentWaterY) * dampK;
    riverWaterMesh.position.y = currentWaterY;
    waterShaderUniforms.uWaveAmp.value = 0.014 + (params.rainIntensity / 120) * 0.03;

    const murkiness = Math.min(1, (metrics.surfaceRunoffRate / 100) * (params.rainIntensity / 90));
    _color.setHex(0x0284c7).lerp(new THREE.Color(0x7c5e3c), murkiness * 0.65);
    riverWaterMat.color.copy(_color);

    const hasFlood = metrics.floodDepthMeters > 0.02;
    const targetFloodY = hasFlood ? 0.085 + metrics.floodDepthMeters * 0.22 : 0.04;
    const targetFloodOp = hasFlood ? Math.min(0.78, 0.32 + metrics.floodDepthMeters * 0.48) : 0;
    currentFloodY += (targetFloodY - currentFloodY) * dampK;
    currentFloodOpacity += (targetFloodOp - currentFloodOpacity) * dampK;
    floodSheetMesh.position.y = currentFloodY;
    floodSheetMat.opacity = currentFloodOpacity;
    floodSheetMesh.visible = currentFloodOpacity > 0.02;

    // Car hazard lights & motion (paused when grabbed by hand or flooded)
    const hazardBlink = metrics.floodDepthMeters >= 0.15 ? (Math.sin(elapsed * 8) > 0 ? 1.8 : 0.1) : 0.15;
    for (const h of [...car1.hazardLights, ...car2.hazardLights]) {
      (h.material as THREE.MeshStandardMaterial).emissiveIntensity = hazardBlink;
    }

    const car1Item = pickableRegistry.get('urban-car');
    if (metrics.floodDepthMeters < 0.2 && grabbedPickableId !== 'urban-car') {
      if (car1Item) {
        car1Item.targetPos.z = ((car1Item.targetPos.z + dt * 0.65 + 3.0) % 6.0) - 3.0;
      }
      car2.group.position.z = ((car2.group.position.z - dt * 0.55 + 3.0) % 6.0) - 3.0;
    }

    // Smoothly animate all Pickable AR Materials toward their target positions & grab scale
    pickableRegistry.forEach((item, id) => {
      const isGrabbed = grabbedPickableId === id;
      item.group.position.x += (item.targetPos.x - item.group.position.x) * grabDampK;
      item.group.position.y += (item.targetPos.y - item.group.position.y) * grabDampK;
      item.group.position.z += (item.targetPos.z - item.group.position.z) * grabDampK;

      const targetSc = isGrabbed ? 1.12 : 1.0;
      const curSc = item.group.scale.x + (targetSc - item.group.scale.x) * grabDampK;
      item.group.scale.setScalar(curSc);
    });

    // Update Hover / Grab Halo Ring position
    const activeHaloId = grabbedPickableId ?? hoveredPickableId;
    if (activeHaloId && pickableRegistry.has(activeHaloId)) {
      const targetItem = pickableRegistry.get(activeHaloId)!;
      if (targetItem.group.visible) {
        haloMesh.visible = true;
        haloMesh.position.set(
          targetItem.group.position.x,
          0.095,
          targetItem.group.position.z
        );
        const haloMat = haloMesh.material as THREE.MeshBasicMaterial;
        haloMat.color.setHex(grabbedPickableId ? 0x10b981 : 0x38bdf8);
        const pulseScale = 1 + Math.sin(elapsed * 5) * 0.08;
        haloMesh.scale.setScalar(pulseScale);
      } else {
        haloMesh.visible = false;
      }
    } else {
      haloMesh.visible = false;
    }

    // 6. Storm Cloud darkening & gentle drift
    const rainNorm = params.rainIntensity / 120;
    currentCloudDarkness += (rainNorm - currentCloudDarkness) * dampK;
    _color.setHex(0xf1f5f9).lerp(new THREE.Color(0x334155), currentCloudDarkness * 0.85);
    cloudMat.color.copy(_color);
    cloudMat.opacity = 0.35 + currentCloudDarkness * 0.6;
    cloudGroup.position.x = Math.sin(elapsed * 0.25) * 0.22;

    // 7. Instanced Rain Streaks
    const activeRainCount = Math.floor(RAIN_COUNT * rainNorm);
    rainInstanced.count = activeRainCount;
    if (activeRainCount > 0) {
      for (let i = 0; i < activeRainCount; i++) {
        const idx = i * 4;
        rainSeeds[idx + 1] -= rainSeeds[idx + 3] * dt * (0.75 + rainNorm * 0.55);
        if (rainSeeds[idx + 1] < 0.08) {
          rainSeeds[idx + 1] = 4.9;
        }
        _dummy.position.set(rainSeeds[idx], rainSeeds[idx + 1], rainSeeds[idx + 2]);
        _dummy.rotation.set(0, 0, 0.06);
        _dummy.scale.set(1, 0.7 + rainNorm * 0.8, 1);
        _dummy.updateMatrix();
        rainInstanced.setMatrixAt(i, _dummy.matrix);
      }
      rainInstanced.instanceMatrix.needsUpdate = true;
    }

    // 8. Instanced Surface Runoff Arrows/Streaks (from urban blocks -> drain)
    const runoffNorm =
      params.rainIntensity > 4
        ? (params.rainIntensity / 120) * (metrics.surfaceRunoffRate / 100)
        : 0;
    const activeRunoffCount = Math.floor(RUNOFF_COUNT * Math.min(1, runoffNorm * 1.25));
    runoffInstanced.count = activeRunoffCount;
    if (activeRunoffCount > 0) {
      const flowSpeed = 0.45 + runoffNorm * 1.15;
      for (let i = 0; i < activeRunoffCount; i++) {
        const idx = i * 3;
        runoffSeeds[idx] = (runoffSeeds[idx] + runoffSeeds[idx + 2] * flowSpeed * dt) % 1;
        const p = runoffSeeds[idx];
        const maxX = params.drainageClogged || metrics.drainLoadPercent > 100 ? 2.4 : 1.02;
        const rx = -3.8 + p * (maxX + 3.8);
        _dummy.position.set(rx, 0.092, runoffSeeds[idx + 1]);
        _dummy.rotation.set(0, 0, 0);
        _dummy.scale.set(0.8 + runoffNorm * 0.6, 1, 1);
        _dummy.updateMatrix();
        runoffInstanced.setMatrixAt(i, _dummy.matrix);
      }
      runoffInstanced.instanceMatrix.needsUpdate = true;
    }
  };

  const dispose = () => {
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
  };

  return {
    root,
    interactables,
    pickableProxies,
    getPickableInfo: (id: PickableItemId) => pickableRegistry.get(id)?.info,
    setHoveredPickable,
    grabPickable,
    moveGrabbedPickable,
    releaseGrabbedPickable,
    resetPickables,
    update,
    dispose,
  };
}
