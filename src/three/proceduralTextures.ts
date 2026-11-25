import * as THREE from 'three';

export interface ProceduralTextureSet {
  asphaltMap: THREE.CanvasTexture;
  asphaltRoughness: THREE.CanvasTexture;
  concreteMap: THREE.CanvasTexture;
  permeablePaverMap: THREE.CanvasTexture;
  buildingFacadeMap: THREE.CanvasTexture;
  buildingEmissiveMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  waterBumpMap: THREE.CanvasTexture;
  soilCutawayMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Asphalt Road Texture + Roughness Map
  const [asphaltCanvas, aCtx] = makeCanvas(512, 512);
  aCtx.fillStyle = '#2a2e35';
  aCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const v = 35 + Math.floor(Math.random() * 28);
    aCtx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    aCtx.fillRect(x, y, 2, 2);
  }
  // Lane edges and center dashed divider
  aCtx.fillStyle = '#cbd5e1';
  aCtx.fillRect(18, 0, 8, 512);
  aCtx.fillRect(486, 0, 8, 512);
  aCtx.fillStyle = '#fbbf24';
  for (let y = 16; y < 512; y += 64) {
    aCtx.fillRect(252, y, 8, 34);
  }

  const asphaltMap = new THREE.CanvasTexture(asphaltCanvas);
  asphaltMap.colorSpace = THREE.SRGBColorSpace;
  asphaltMap.wrapS = THREE.RepeatWrapping;
  asphaltMap.wrapT = THREE.RepeatWrapping;
  asphaltMap.anisotropy = maxAnisotropy;

  const [roughCanvas, rCtx] = makeCanvas(256, 256);
  rCtx.fillStyle = '#c8c8c8';
  rCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const g = 150 + Math.floor(Math.random() * 90);
    rCtx.fillStyle = `rgb(${g},${g},${g})`;
    rCtx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const asphaltRoughness = new THREE.CanvasTexture(roughCanvas);
  asphaltRoughness.wrapS = THREE.RepeatWrapping;
  asphaltRoughness.wrapT = THREE.RepeatWrapping;

  // 2. Sealed Impervious Concrete Texture
  const [concCanvas, cCtx] = makeCanvas(512, 512);
  cCtx.fillStyle = '#7e8691';
  cCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4000; i++) {
    const g = 112 + Math.floor(Math.random() * 28);
    cCtx.fillStyle = `rgba(${g},${g + 3},${g + 6},0.35)`;
    cCtx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }
  cCtx.strokeStyle = 'rgba(51, 65, 85, 0.35)';
  cCtx.lineWidth = 2;
  for (let g = 0; g <= 512; g += 64) {
    cCtx.beginPath();
    cCtx.moveTo(g, 0);
    cCtx.lineTo(g, 512);
    cCtx.stroke();
    cCtx.beginPath();
    cCtx.moveTo(0, g);
    cCtx.lineTo(512, g);
    cCtx.stroke();
  }
  const concreteMap = new THREE.CanvasTexture(concCanvas);
  concreteMap.colorSpace = THREE.SRGBColorSpace;
  concreteMap.wrapS = THREE.RepeatWrapping;
  concreteMap.wrapT = THREE.RepeatWrapping;
  concreteMap.repeat.set(3, 3);
  concreteMap.anisotropy = maxAnisotropy;

  // 3. Permeable Eco-Paver Texture (Grass + Stone Interlock)
  const [permCanvas, pCtx] = makeCanvas(512, 512);
  pCtx.fillStyle = '#3b7a47';
  pCtx.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 32) {
    for (let x = 0; x < 512; x += 32) {
      pCtx.fillStyle = '#94a3b8';
      pCtx.fillRect(x + 2, y + 2, 28, 28);
      pCtx.fillStyle = '#3f8a4e';
      pCtx.fillRect(x + 8, y + 8, 16, 16);
      pCtx.fillStyle = '#4da65e';
      pCtx.fillRect(x + 11, y + 11, 10, 10);
    }
  }
  const permeablePaverMap = new THREE.CanvasTexture(permCanvas);
  permeablePaverMap.colorSpace = THREE.SRGBColorSpace;
  permeablePaverMap.wrapS = THREE.RepeatWrapping;
  permeablePaverMap.wrapT = THREE.RepeatWrapping;
  permeablePaverMap.repeat.set(4, 4);
  permeablePaverMap.anisotropy = maxAnisotropy;

  // 4. Urban Building Curtain-Wall Glass & Window Grid
  const [facCanvas, fCtx] = makeCanvas(512, 512);
  const [emiCanvas, eCtx] = makeCanvas(512, 512);
  fCtx.fillStyle = '#1e293b';
  fCtx.fillRect(0, 0, 512, 512);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, 512, 512);

  const cols = 8;
  const rows = 16;
  const cw = 512 / cols;
  const rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() > 0.48;
      fCtx.fillStyle = lit ? '#7dd3fc' : '#334155';
      fCtx.fillRect(c * cw + 6, r * rh + 4, cw - 12, rh - 8);
      if (lit) {
        eCtx.fillStyle = Math.random() > 0.3 ? '#fef08a' : '#7dd3fc';
        eCtx.fillRect(c * cw + 6, r * rh + 4, cw - 12, rh - 8);
      }
    }
  }
  const buildingFacadeMap = new THREE.CanvasTexture(facCanvas);
  buildingFacadeMap.colorSpace = THREE.SRGBColorSpace;
  buildingFacadeMap.wrapS = THREE.RepeatWrapping;
  buildingFacadeMap.wrapT = THREE.RepeatWrapping;
  buildingFacadeMap.anisotropy = maxAnisotropy;

  const buildingEmissiveMap = new THREE.CanvasTexture(emiCanvas);
  buildingEmissiveMap.colorSpace = THREE.SRGBColorSpace;
  buildingEmissiveMap.wrapS = THREE.RepeatWrapping;
  buildingEmissiveMap.wrapT = THREE.RepeatWrapping;

  // 5. Soft Radial Contact Shadow
  const [shadowCanvas, sCtx] = makeCanvas(256, 256);
  const grad = sCtx.createRadialGradient(128, 128, 10, 128, 128, 125);
  grad.addColorStop(0, 'rgba(2, 6, 23, 0.72)');
  grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.35)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 256, 256);
  const contactShadowMap = new THREE.CanvasTexture(shadowCanvas);

  // 6. Water Bump Texture
  const [waterCanvas, wCtx] = makeCanvas(256, 256);
  wCtx.fillStyle = '#808080';
  wCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 140; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const rad = 10 + Math.random() * 26;
    const wg = wCtx.createRadialGradient(x, y, 0, x, y, rad);
    wg.addColorStop(0, 'rgba(215, 215, 215, 0.35)');
    wg.addColorStop(0.5, 'rgba(90, 90, 90, 0.2)');
    wg.addColorStop(1, 'rgba(128, 128, 128, 0)');
    wCtx.fillStyle = wg;
    wCtx.beginPath();
    wCtx.arc(x, y, rad, 0, Math.PI * 2);
    wCtx.fill();
  }
  const waterBumpMap = new THREE.CanvasTexture(waterCanvas);
  waterBumpMap.wrapS = THREE.RepeatWrapping;
  waterBumpMap.wrapT = THREE.RepeatWrapping;
  waterBumpMap.repeat.set(4, 4);

  // 7. Geological Soil Cutaway Texture (Topsoil -> Clay Subsoil -> Aquifer/Bedrock)
  const [soilCanvas, soilCtx] = makeCanvas(512, 256);
  // Topsoil
  soilCtx.fillStyle = '#4a3525';
  soilCtx.fillRect(0, 0, 512, 70);
  // Subsoil clay
  soilCtx.fillStyle = '#7c5338';
  soilCtx.fillRect(0, 70, 512, 95);
  // Bedrock / gravel
  soilCtx.fillStyle = '#475569';
  soilCtx.fillRect(0, 165, 512, 91);
  // Speckle stones & organic pores
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 256;
    soilCtx.fillStyle =
      y < 70
        ? 'rgba(30, 20, 12, 0.35)'
        : y < 165
          ? 'rgba(160, 110, 70, 0.25)'
          : 'rgba(148, 163, 184, 0.3)';
    soilCtx.fillRect(x, y, 4, 3);
  }
  const soilCutawayMap = new THREE.CanvasTexture(soilCanvas);
  soilCutawayMap.colorSpace = THREE.SRGBColorSpace;
  soilCutawayMap.wrapS = THREE.RepeatWrapping;
  soilCutawayMap.anisotropy = maxAnisotropy;

  return {
    asphaltMap,
    asphaltRoughness,
    concreteMap,
    permeablePaverMap,
    buildingFacadeMap,
    buildingEmissiveMap,
    contactShadowMap,
    waterBumpMap,
    soilCutawayMap,
    dispose: () => {
      asphaltMap.dispose();
      asphaltRoughness.dispose();
      concreteMap.dispose();
      permeablePaverMap.dispose();
      buildingFacadeMap.dispose();
      buildingEmissiveMap.dispose();
      contactShadowMap.dispose();
      waterBumpMap.dispose();
      soilCutawayMap.dispose();
    },
  };
}
