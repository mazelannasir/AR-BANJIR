export interface SimulationParams {
  rainIntensity: number; // mm/j (0 - 120)
  urbanDensity: number; // % kawasan berturap tidak telap air (20 - 95)
  drainageClogged: boolean; // sistem perparitan tersumbat sampah/kelodak
  greenMitigation: boolean; // kolam takungan, turapan telap air & taman hujan
}

export type FloodStatus = 'SELAMAT' | 'BERJAGA-JAGA' | 'BANJIR KILAT';

export interface HydrologyMetrics {
  infiltrationRate: number; // % air meresap ke dalam tanah
  surfaceRunoffRate: number; // % air larian permukaan
  runoffVolumeIndex: number; // L/s per hektar (anggaran simulasi)
  drainLoadPercent: number; // % beban kapasiti sistem perparitan
  floodDepthMeters: number; // m paras air di jalan raya bandar
  riverLevelRatio: number; // 0.0 - 1.0 paras sungai
  status: FloodStatus;
}

export function calculateHydrology(params: SimulationParams): HydrologyMetrics {
  const { rainIntensity, urbanDensity, drainageClogged, greenMitigation } = params;

  // Impervious fraction (0.20 - 0.95), reduced by permeable pavements & rain gardens if greenMitigation is active
  const effectiveImpervious = greenMitigation
    ? Math.max(0.15, (urbanDensity / 100) * 0.62)
    : urbanDensity / 100;

  const infiltrationRate = Math.round((1 - effectiveImpervious) * 100);
  const surfaceRunoffRate = 100 - infiltrationRate;

  // Rain factor (0 to 1.2)
  const rainFactor = rainIntensity / 100;

  // Runoff volume index (L/s/ha)
  const runoffVolumeIndex = Math.round(rainIntensity * (0.4 + effectiveImpervious * 1.35) * 10) / 10;

  // Effective drainage capacity (100 base; drops to 42 if clogged; rises to 145 with retention pond + bioswale)
  const drainCapacity =
    (drainageClogged ? 42 : 100) + (greenMitigation ? 45 : 0);

  const rawDemand = rainIntensity * (0.45 + effectiveImpervious * 0.95);
  const drainLoadPercent = Math.min(200, Math.round((rawDemand / drainCapacity) * 100));

  // Excess water overflows onto road surface
  const overflowRatio = Math.max(0, (rawDemand - drainCapacity * 0.78) / 85);
  const floodDepthMeters =
    rainIntensity < 8
      ? 0
      : Math.round(Math.min(1.65, overflowRatio * 1.15) * 100) / 100;

  const riverLevelRatio = Math.min(
    1,
    0.18 + rainFactor * 0.42 + effectiveImpervious * rainFactor * 0.32 + (drainageClogged ? 0.1 : 0) - (greenMitigation ? 0.12 : 0)
  );

  let status: FloodStatus = 'SELAMAT';
  if (floodDepthMeters >= 0.35 || drainLoadPercent >= 120) {
    status = 'BANJIR KILAT';
  } else if (floodDepthMeters >= 0.08 || drainLoadPercent >= 85) {
    status = 'BERJAGA-JAGA';
  }

  return {
    infiltrationRate,
    surfaceRunoffRate,
    runoffVolumeIndex,
    drainLoadPercent,
    floodDepthMeters,
    riverLevelRatio: Math.max(0.12, riverLevelRatio),
    status,
  };
}

export type HotspotCategory =
  | 'Faktor Penyumbang'
  | 'Proses Hidrologi'
  | 'Langkah Mitigasi';

export type CameraPresetId = 'overview' | 'drainage' | 'river' | 'mitigation';

export interface ScientificHotspot {
  id: string;
  number: string;
  title: string;
  shortLabel: string;
  category: HotspotCategory;
  anchor: [number, number, number];
  cameraPreset: CameraPresetId;
  scientificExplanation: string;
  keyFact: string;
  mitigationTip: string;
}

export const SCIENTIFIC_HOTSPOTS: ScientificHotspot[] = [
  {
    id: 'urban-impervious',
    number: '01',
    title: 'Pembangunan & Permukaan Tidak Telap Air',
    shortLabel: 'Permukaan Konkrit',
    category: 'Faktor Penyumbang',
    anchor: [-2.4, 2.3, -1.6],
    cameraPreset: 'overview',
    scientificExplanation:
      'Pembangunan bandar menggantikan tanah semula jadi dan tumbuhan dengan jalan tar serta konkrit yang tidak telap air. Akibatnya, kadar resapan air hujan ke dalam tanah menurun dengan mendadak.',
    keyFact: 'Kawasan berturap tinggi boleh meningkatkan air larian permukaan sehingga lebih 80%.',
    mitigationTip:
      'Gunakan turapan telap air (permeable pavement) di kawasan parkir dan laluan pejalan kaki supaya air dapat meresap ke dalam tanah.',
  },
  {
    id: 'heavy-rain',
    number: '02',
    title: 'Hujan Lebat & Perubahan Iklim',
    shortLabel: 'Hujan Lebat',
    category: 'Proses Hidrologi',
    anchor: [0.0, 4.9, -0.5],
    cameraPreset: 'overview',
    scientificExplanation:
      'Hujan lebat berintensiti tinggi membekalkan isi padu air yang besar dalam tempoh singkat. Apabila kadar hujan melebihi kadar resapan tanah dan kapasiti saliran, lebihan air berkumpul di permukaan.',
    keyFact: 'Hujan melebihi 60 mm/jam berisiko tinggi mencetuskan banjir kilat di kawasan bandar.',
    mitigationTip:
      'Wujudkan sistem amaran awal cuaca dan kolam takungan hujan untuk menyerap puncak aliran air ribut.',
  },
  {
    id: 'surface-runoff',
    number: '03',
    title: 'Air Larian Permukaan (Surface Runoff)',
    shortLabel: 'Air Larian Permukaan',
    category: 'Proses Hidrologi',
    anchor: [-0.6, 0.55, 1.3],
    cameraPreset: 'drainage',
    scientificExplanation:
      'Air hujan yang tidak dapat meresap ke dalam tanah akan mengalir deras di atas permukaan jalan dan bumbung bangunan menuju ke longkang serta sungai berhampiran.',
    keyFact: 'Tanpa halangan tumbuhan, halaju air larian meningkat dan membawa kelodak serta pencemar ke sungai.',
    mitigationTip:
      'Bina taman hujan (rain garden) dan zon penampan berumput untuk memperlahankan kelajuan air larian permukaan.',
  },
  {
    id: 'drainage-system',
    number: '04',
    title: 'Sistem Perparitan & Risiko Tersumbat',
    shortLabel: 'Sistem Perparitan',
    category: 'Faktor Penyumbang',
    anchor: [0.95, 0.45, 1.45],
    cameraPreset: 'drainage',
    scientificExplanation:
      'Longkang dan pembetung berfungsi mengalirkan air larian permukaan keluar dari bandar ke sungai. Pembuangan sampah pepejal dan kelodak menyekat aliran ini, menyebabkan air melimpah ke jalan raya.',
    keyFact: 'Longkang yang tersumbat mengurangkan kapasiti saliran lebih daripada 50%.',
    mitigationTip:
      'Lakukan penyelenggaraan berkala, pasang perangkap sampah pada parit utama dan naik taraf saiz pembetung bandar.',
  },
  {
    id: 'river-flood',
    number: '05',
    title: 'Limpahan Sungai & Banjir Kilat',
    shortLabel: 'Limpahan Sungai',
    category: 'Proses Hidrologi',
    anchor: [3.2, 0.65, 0.4],
    cameraPreset: 'river',
    scientificExplanation:
      'Apabila isi padu air larian permukaan tiba serentak di sungai dalam masa yang singkat, paras air sungai melebihi tebing dan membanjiri kawasan rendah di bandar.',
    keyFact: 'Banjir kilat menjejaskan ekosistem akuatik melalui pencemaran air dan hakisan tebing.',
    mitigationTip:
      'Pelihara rizab sungai (zon penampan riparian) dan bina benteng tebing mesra alam untuk menstabilkan ekosistem air.',
  },
  {
    id: 'green-mitigation',
    number: '06',
    title: 'Kolam Takungan & Penghijauan Bandar',
    shortLabel: 'Langkah Mitigasi Hijau',
    category: 'Langkah Mitigasi',
    anchor: [-2.8, 1.15, 2.2],
    cameraPreset: 'mitigation',
    scientificExplanation:
      'Pokok, taman hujan dan kolam takungan banjir memerangkap serta menyimpan air hujan buat sementara waktu, meningkatkan resapan tanah dan menapis bahan pencemar sebelum air masuk ke sungai.',
    keyFact: 'Pendekatan kelestarian ekosistem air mengekalkan kitaran air semula jadi di kawasan bandar.',
    mitigationTip:
      'Aktifkan togol "Langkah Hijau" pada panel kawalan untuk melihat kesan langsung terhadap paras banjir!',
  },
];

export interface SimulationMission {
  id: string;
  title: string;
  scenario: string;
  goalText: string;
  setupParams: SimulationParams;
  checkSuccess: (params: SimulationParams, metrics: HydrologyMetrics) => boolean;
  successMessage: string;
  hint: string;
}

export const SIMULATION_MISSIONS: SimulationMission[] = [
  {
    id: 'misi-1',
    title: 'Misi 1: Kawal Banjir Ketika Ribut Monsun',
    scenario:
      'Hujan lebat turun pada kadar 90 mm/j di bandar padat dengan parit tersumbat. Paras air jalan raya kini berbahaya.',
    goalText: 'Turunkan paras banjir di jalan raya kepada 0.00 m (Status: SELAMAT) tanpa mengurangkan hujan.',
    setupParams: {
      rainIntensity: 90,
      urbanDensity: 85,
      drainageClogged: true,
      greenMitigation: false,
    },
    checkSuccess: (params, metrics) =>
      params.rainIntensity >= 85 && metrics.status === 'SELAMAT' && metrics.floodDepthMeters === 0,
    successMessage:
      'Syabas! Dengan membersihkan sistem perparitan dan mengaktifkan Langkah Hijau (kolam takungan & turapan telap air), kadar resapan meningkat dan bandar kekal selamat walaupun hujan 90 mm/j.',
    hint: 'Bersihkan parit tersumbat dan aktifkan Langkah Hijau pada panel kawalan di bawah.',
  },
  {
    id: 'misi-2',
    title: 'Misi 2: Tingkatkan Resapan Tanah Bandar',
    scenario:
      'Bandar ini mempunyai 90% permukaan berturap konkrit menyebabkan air larian permukaan terlalu tinggi.',
    goalText: 'Capai kadar resapan tanah sekurang-kurangnya 45% semasa hujan sederhana (60 mm/j).',
    setupParams: {
      rainIntensity: 60,
      urbanDensity: 90,
      drainageClogged: false,
      greenMitigation: false,
    },
    checkSuccess: (_params, metrics) => metrics.infiltrationRate >= 45,
    successMessage:
      'Tepat sekali! Mengurangkan ketumpatan permukaan konkrit serta menggunakan turapan telap air membolehkan lebih banyak air hujan meresap ke dalam tanah.',
    hint: 'Kurangkan Kepadatan Pembangunan atau aktifkan Langkah Hijau untuk meningkatkan resapan tanah.',
  },
  {
    id: 'misi-3',
    title: 'Misi 3: Sahkan Kesan Longkang Tersumbat',
    scenario:
      'Bandingkan keadaan saliran bersih dengan saliran tersumbat ketika hujan 75 mm/j dan pembangunan 75%.',
    goalText: 'Perhatikan bagaimana longkang tersumbat menaikkan beban saliran melebihi 120% (BANJIR KILAT).',
    setupParams: {
      rainIntensity: 75,
      urbanDensity: 75,
      drainageClogged: false,
      greenMitigation: false,
    },
    checkSuccess: (params, metrics) =>
      params.drainageClogged && metrics.drainLoadPercent >= 120 && metrics.status === 'BANJIR KILAT',
    successMessage:
      'Pemerhatian berjaya! Sampah dan kelodak menyekat kapasiti longkang sehingga air larian permukaan melimpah dan mencetuskan banjir kilat.',
    hint: 'Togol status Parit kepada "Tersumbat" untuk melihat simulasi limpahan air.',
  },
];

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1',
    question:
      'Mengapakah pembangunan bandar yang pesat dengan permukaan konkrit dan jalan tar meningkatkan risiko banjir kilat?',
    options: [
      'Permukaan tidak telap air menghalang resapan air ke dalam tanah dan meningkatkan air larian permukaan',
      'Konkrit menyerap terlalu banyak air hujan sehingga menjadi berat dan tenggelam',
      'Bangunan tinggi meningkatkan kadar sejatan air dari sungai secara serta-merta',
      'Jalan tar menukarkan air hujan menjadi wap air di permukaan jalan',
    ],
    correctIndex: 0,
    explanation:
      'Konkrit dan asfalt ialah permukaan tidak telap air. Air hujan tidak dapat meresap ke dalam tanah, lalu mengalir deras sebagai air larian permukaan ke sistem perparitan dan sungai.',
  },
  {
    id: 'q2',
    question:
      'Apakah kesan utama apabila sistem perparitan di kawasan bandar tersumbat dengan sampah pepejal dan kelodak?',
    options: [
      'Kadar resapan air ke dalam tanah meningkat dengan lebih cepat',
      'Kapasiti aliran parit berkurang sehingga air melimpah ke jalan raya dan menyebabkan banjir',
      'Keamatan hujan lebat di atmosfera berkurangan secara semula jadi',
      'Air sungai mengalir balik ke awan ribut',
    ],
    correctIndex: 1,
    explanation:
      'Sampah dan kelodak menyekat aliran air di dalam longkang dan pembetung. Apabila hujan lebat turun, air tidak dapat disalurkan ke sungai dengan cepat lalu melimpah ke kawasan bandar.',
  },
  {
    id: 'q3',
    question:
      'Antara langkah berikut, manakah paling berkesan untuk mengurangkan air larian permukaan sambil memelihara kelestarian ekosistem air?',
    options: [
      'Menutup semua kawasan taman berumput dengan lapisan simen licin',
      'Membuang sisa plastik ke dalam longkang utama sebelum musim hujan',
      'Membina kolam takungan banjir, taman hujan dan menggunakan turapan telap air',
      'Menebang semua pokok di sepanjang tebing sungai bandar',
    ],
    correctIndex: 2,
    explanation:
      'Kolam takungan menyimpan lebihan air ribut buat sementara waktu, manakala taman hujan dan turapan telap air menggalakkan resapan semula jadi ke dalam tanah.',
  },
  {
    id: 'q4',
    question:
      'Dalam kitaran hidrologi bandar, apakah hubungan yang betul antara kadar resapan tanah dengan air larian permukaan?',
    options: [
      'Apabila kadar resapan tanah meningkat, isi padu air larian permukaan berkurang',
      'Apabila kadar resapan tanah menurun, air larian permukaan juga menurun',
      'Kadar resapan tanah tidak mempunyai sebarang kaitan dengan banjir kilat',
      'Air larian permukaan hanya berlaku apabila pokok ditanam terlalu rapat',
    ],
    correctIndex: 0,
    explanation:
      'Lebih banyak air hujan yang meresap masuk ke dalam tanah bermakna kurang isi padu air yang mengalir di atas permukaan menuju ke longkang dan sungai.',
  },
  {
    id: 'q5',
    question:
      'Mengapakah pemeliharaan zon penampan tumbuhan di tebing sungai penting untuk kelestarian ekosistem air?',
    options: [
      'Menghalang cahaya matahari daripada menyinari kawasan bandar',
      'Menstabilkan tebing sungai daripada hakisan dan menapis bahan pencemar daripada air larian',
      'Menghentikan sepenuhnya kejadian hujan lebat sepanjang tahun',
      'Menjadikan air sungai tidak boleh mengalir ke laut',
    ],
    correctIndex: 1,
    explanation:
      'Akar tumbuhan mengukuhkan struktur tanah tebing sungai untuk mengurangkan hakisan serta memerangkap mendapan dan bahan pencemar sebelum memasuki ekosistem sungai.',
  },
];
