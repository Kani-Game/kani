import { SteamRequirementBlock, SteamSpecData } from '../types/game';

export type PcOsOption =
  | 'Windows 11 64-bit'
  | 'Windows 10 64-bit'
  | 'Windows 7/8 64-bit'
  | 'macOS'
  | 'Linux';

export interface UserPcSpecs {
  os: PcOsOption;
  cpu: string;
  ramGb: number;
  gpu: string;
  storageFreeGb?: number;
}

export type ComponentMatchLevel =
  | 'recommended'
  | 'minimum'
  | 'below'
  | 'unknown';

export interface ComponentCheckResult {
  key: 'os' | 'cpu' | 'ram' | 'gpu' | 'storage';
  label: string;
  labelKm: string;
  status: ComponentMatchLevel;
  userValue: string;
  minValue: string;
  recValue: string;
  note: string;
}

export interface PcCompatibilityReport {
  overall: 'recommended' | 'minimum' | 'below' | 'partial';
  headlineEn: string;
  headlineKm: string;
  summaryKm: string;
  components: ComponentCheckResult[];
  analyzedByAi?: boolean;
}

const STORAGE_KEY_PC_SPECS = 'kanigame_user_pc_specs_v2';

export const GPU_PRESETS = [
  'NVIDIA GeForce RTX 4090',
  'NVIDIA GeForce RTX 4080',
  'NVIDIA GeForce RTX 4070 Super',
  'NVIDIA GeForce RTX 4070',
  'NVIDIA GeForce RTX 4060 Ti',
  'NVIDIA GeForce RTX 4060',
  'NVIDIA GeForce RTX 4050 Laptop GPU',
  'NVIDIA GeForce RTX 3080',
  'NVIDIA GeForce RTX 3070',
  'NVIDIA GeForce RTX 3060 Ti',
  'NVIDIA GeForce RTX 3060',
  'NVIDIA GeForce RTX 3050',
  'NVIDIA GeForce RTX 2060',
  'NVIDIA GeForce GTX 1660 Super',
  'NVIDIA GeForce GTX 1650',
  'NVIDIA GeForce GTX 1060 6GB',
  'NVIDIA GeForce GTX 1050 Ti',
  'NVIDIA GeForce GTX 750 Ti',
  'AMD Radeon RX 7800 XT',
  'AMD Radeon RX 7600',
  'AMD Radeon RX 6700 XT',
  'AMD Radeon RX 6600',
  'AMD Radeon RX 580',
  'AMD Radeon RX 570',
  'Intel Arc A750',
  'Intel Iris Xe Graphics',
  'Intel UHD Graphics 770',
  'Intel UHD Graphics 730',
];

export const CPU_PRESETS = [
  'Intel Core i9-14900K',
  'Intel Core i7-14700K',
  'Intel Core i7-13700F',
  'Intel Core i5-14400F',
  'Intel Core i5-13400F',
  'Intel Core i5-12400F',
  'Intel Core i5-11400F',
  'Intel Core i5-10400F',
  'Intel Core i5-9400F',
  'Intel Core i5-8400',
  'Intel Core i3-12100F',
  'Intel Core i3-10100F',
  'AMD Ryzen 9 7900X',
  'AMD Ryzen 7 7800X3D',
  'AMD Ryzen 7 5800X',
  'AMD Ryzen 7 5700X',
  'AMD Ryzen 5 7600',
  'AMD Ryzen 5 5600X',
  'AMD Ryzen 5 5600',
  'AMD Ryzen 5 3600',
  'AMD Ryzen 5 2600',
  'AMD Ryzen 3 4100',
];

export function getEmptyPcSpecs(): UserPcSpecs {
  return {
    os: 'Windows 11 64-bit',
    cpu: '',
    ramGb: 0,
    gpu: '',
    storageFreeGb: undefined,
  };
}

export function loadSavedPcSpecs(): UserPcSpecs {
  const empty = getEmptyPcSpecs();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PC_SPECS);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<UserPcSpecs>;
      return {
        os: parsed.os || empty.os,
        cpu: typeof parsed.cpu === 'string' ? parsed.cpu : '',
        ramGb:
          typeof parsed.ramGb === 'number' && parsed.ramGb > 0 ? parsed.ramGb : 0,
        gpu: typeof parsed.gpu === 'string' ? parsed.gpu : '',
        storageFreeGb:
          typeof parsed.storageFreeGb === 'number' && parsed.storageFreeGb > 0
            ? parsed.storageFreeGb
            : undefined,
      };
    }
  } catch {
    // ignore storage failures
  }
  return empty;
}

export function savePcSpecs(specs: UserPcSpecs): void {
  try {
    localStorage.setItem(STORAGE_KEY_PC_SPECS, JSON.stringify(specs));
  } catch {
    // ignore storage failures
  }
}

function findSpecField(block: SteamRequirementBlock | undefined, keys: string[]): string {
  if (!block?.items?.length) return '';
  for (const item of block.items) {
    const label = item.label.toLowerCase();
    if (keys.some((k) => label.includes(k))) {
      return item.value.trim();
    }
  }
  return '';
}

function parseRamGb(text: string): number | null {
  if (!text) return null;
  const gbMatch = text.match(/(\d+(?:\.\d+)?)\s*gb/i);
  if (gbMatch) return parseFloat(gbMatch[1]);
  const mbMatch = text.match(/(\d+)\s*mb/i);
  if (mbMatch) return Math.round((parseInt(mbMatch[1], 10) / 1024) * 10) / 10;
  return null;
}

function parseStorageGb(text: string): number | null {
  if (!text) return null;
  const tbMatch = text.match(/(\d+(?:\.\d+)?)\s*tb/i);
  if (tbMatch) return parseFloat(tbMatch[1]) * 1024;
  const gbMatch = text.match(/(\d+(?:\.\d+)?)\s*gb/i);
  if (gbMatch) return parseFloat(gbMatch[1]);
  const mbMatch = text.match(/(\d+)\s*mb/i);
  if (mbMatch) return Math.round((parseInt(mbMatch[1], 10) / 1024) * 10) / 10;
  return null;
}

// GPU relative performance tier (0 - 1000 scale, approximate 1080p gaming class)
const GPU_TIER_TABLE: Array<[RegExp, number]> = [
  [/rtx\s*5090/i, 990],
  [/rtx\s*5080/i, 920],
  [/rtx\s*5070\s*ti/i, 860],
  [/rtx\s*5070/i, 800],
  [/rtx\s*4090/i, 960],
  [/rtx\s*4080(\s*super)?/i, 890],
  [/rtx\s*4070\s*ti(\s*super)?/i, 820],
  [/rtx\s*4070\s*super/i, 790],
  [/rtx\s*4070/i, 750],
  [/rtx\s*4060\s*ti/i, 660],
  [/rtx\s*4060/i, 600],
  [/rtx\s*4050/i, 500],
  [/rtx\s*3090(\s*ti)?/i, 840],
  [/rtx\s*3080\s*ti/i, 810],
  [/rtx\s*3080/i, 780],
  [/rtx\s*3070\s*ti/i, 715],
  [/rtx\s*3070/i, 690],
  [/rtx\s*3060\s*ti/i, 635],
  [/rtx\s*3060/i, 560],
  [/rtx\s*3050\s*ti/i, 445],
  [/rtx\s*3050/i, 420],
  [/rtx\s*2080\s*ti/i, 700],
  [/rtx\s*2080(\s*super)?/i, 650],
  [/rtx\s*2070(\s*super)?/i, 600],
  [/rtx\s*2060\s*super/i, 560],
  [/rtx\s*2060/i, 515],
  [/rtx\s*2050/i, 355],
  [/gtx\s*1080\s*ti/i, 600],
  [/gtx\s*1080/i, 535],
  [/gtx\s*1070\s*ti/i, 505],
  [/gtx\s*1070/i, 475],
  [/gtx\s*1660\s*(super|ti)/i, 460],
  [/gtx\s*1660/i, 430],
  [/gtx\s*1650\s*super/i, 390],
  [/gtx\s*1650\s*ti/i, 355],
  [/gtx\s*1650/i, 330],
  [/gtx\s*1060/i, 365],
  [/gtx\s*980\s*ti/i, 420],
  [/gtx\s*980/i, 360],
  [/gtx\s*970/i, 325],
  [/gtx\s*1050\s*ti/i, 260],
  [/gtx\s*1050/i, 225],
  [/gtx\s*960/i, 240],
  [/gtx\s*950/i, 205],
  [/gtx\s*780/i, 245],
  [/gtx\s*770/i, 220],
  [/gtx\s*760/i, 185],
  [/gtx\s*750\s*ti/i, 165],
  [/gtx\s*660/i, 150],
  [/gtx\s*650/i, 120],
  [/gt\s*1030/i, 125],
  [/gt\s*730|gt\s*710/i, 70],
  [/mx\s*[45]\d0/i, 130],
  [/mx\s*[123]\d0/i, 95],

  // AMD Radeon RX
  [/rx\s*9070\s*xt/i, 860],
  [/rx\s*9070/i, 810],
  [/rx\s*7900\s*xtx/i, 900],
  [/rx\s*7900\s*xt/i, 850],
  [/rx\s*7900\s*gre/i, 780],
  [/rx\s*7800\s*xt/i, 740],
  [/rx\s*7700\s*xt/i, 675],
  [/rx\s*7600(\s*xt)?/i, 575],
  [/rx\s*6950\s*xt|rx\s*6900\s*xt/i, 770],
  [/rx\s*6800\s*xt/i, 730],
  [/rx\s*6800/i, 670],
  [/rx\s*6750\s*xt|rx\s*6700\s*xt/i, 625],
  [/rx\s*6650\s*xt|rx\s*6600\s*xt/i, 570],
  [/rx\s*6600/i, 515],
  [/rx\s*6500\s*xt/i, 310],
  [/rx\s*6400/i, 255],
  [/rx\s*5700\s*xt/i, 575],
  [/rx\s*5700/i, 520],
  [/rx\s*5600\s*xt/i, 505],
  [/rx\s*5500\s*xt/i, 375],
  [/rx\s*590/i, 370],
  [/rx\s*580/i, 345],
  [/rx\s*480/i, 330],
  [/rx\s*570/i, 300],
  [/rx\s*470/i, 285],
  [/rx\s*560|rx\s*460/i, 195],
  [/rx\s*550/i, 130],
  [/vega\s*64/i, 420],
  [/vega\s*56/i, 385],
  [/r9\s*390|r9\s*290/i, 290],
  [/r9\s*380|r9\s*280/i, 235],
  [/r9\s*270|r7\s*370/i, 180],
  [/radeon\s*780m|radeon\s*880m|radeon\s*890m/i, 275],
  [/radeon\s*680m/i, 210],
  [/radeon\s*(tm\s*)?graphics|vega\s*[78]/i, 145],

  // Intel Arc / Iris / UHD
  [/arc\s*b580/i, 610],
  [/arc\s*a770/i, 560],
  [/arc\s*a750/i, 525],
  [/arc\s*a580/i, 445],
  [/arc\s*a380/i, 250],
  [/iris\s*xe/i, 165],
  [/uhd\s*(graphics\s*)?7[37]0/i, 115],
  [/uhd\s*(graphics\s*)?6\d0|hd\s*graphics\s*6\d0/i, 85],
  [/uhd\s*graphics|hd\s*graphics/i, 75],

  // Apple Silicon
  [/apple\s*m4\s*max/i, 700],
  [/apple\s*m4\s*pro/i, 560],
  [/apple\s*m4/i, 390],
  [/apple\s*m3\s*max/i, 640],
  [/apple\s*m3\s*pro/i, 510],
  [/apple\s*m3/i, 340],
  [/apple\s*m2\s*max/i, 560],
  [/apple\s*m2\s*pro/i, 440],
  [/apple\s*m2/i, 290],
  [/apple\s*m1\s*max/i, 480],
  [/apple\s*m1\s*pro/i, 380],
  [/apple\s*m1/i, 250],
];

function scoreSingleGpu(segment: string): { score: number | null; vramGb: number | null } {
  const vramMatch = segment.match(/(\d+)\s*gb/i);
  const vramGb = vramMatch ? parseInt(vramMatch[1], 10) : null;
  const isLaptop = /\b(laptop|max-q|mobile)\b/i.test(segment);

  for (const [regex, score] of GPU_TIER_TABLE) {
    if (regex.test(segment)) {
      return {
        score: isLaptop ? Math.round(score * 0.88) : score,
        vramGb,
      };
    }
  }
  return { score: null, vramGb };
}

function scoreRequirementGpu(text: string): { score: number | null; vramGb: number | null } {
  if (!text) return { score: null, vramGb: null };
  const parts = text.split(/\/|\bor\b|,|\|/i).map((s) => s.trim()).filter(Boolean);
  let bestLowScore: number | null = null;
  let bestLowVram: number | null = null;

  for (const part of parts) {
    const res = scoreSingleGpu(part);
    if (res.score !== null) {
      bestLowScore = bestLowScore === null ? res.score : Math.min(bestLowScore, res.score);
    }
    if (res.vramGb !== null) {
      bestLowVram = bestLowVram === null ? res.vramGb : Math.min(bestLowVram, res.vramGb);
    }
  }
  return { score: bestLowScore, vramGb: bestLowVram };
}

function scoreSingleCpu(segment: string): number | null {
  const clean = segment.replace(/\(TM\)|\(R\)|®|™/gi, '').trim();

  // Intel Core Ultra 5/7/9
  const ultraMatch = clean.match(/core\s*ultra\s*(5|7|9)/i);
  if (ultraMatch) {
    const tier = parseInt(ultraMatch[1], 10);
    return tier === 9 ? 900 : tier === 7 ? 830 : 750;
  }

  // Intel Core i3/i5/i7/i9-12400F or i5-8400 or i5 4th gen
  const intelMatch = clean.match(/i([3579])[-\s]?(\d{3,5})/i);
  if (intelMatch) {
    const tier = parseInt(intelMatch[1], 10); // 3,5,7,9
    const modelNum = intelMatch[2];
    const gen =
      modelNum.length >= 5
        ? parseInt(modelNum.slice(0, 2), 10)
        : modelNum.length === 4
        ? parseInt(modelNum.slice(0, 1), 10)
        : 1;
    const tierBonus = tier === 9 ? 140 : tier === 7 ? 95 : tier === 5 ? 50 : 0;
    return Math.min(950, 140 + gen * 48 + tierBonus);
  }

  // Intel Core i3/i5/i7 without 4-digit code
  const intelShort = clean.match(/i([3579])/i);
  if (intelShort) {
    const tier = parseInt(intelShort[1], 10);
    return tier === 9 ? 650 : tier === 7 ? 500 : tier === 5 ? 400 : 300;
  }

  // AMD Ryzen 3/5/7/9 5600X / 2600 / 7800X3D
  const ryzenMatch = clean.match(/ryzen\s*([3579])\s*(\d{4})/i);
  if (ryzenMatch) {
    const tier = parseInt(ryzenMatch[1], 10);
    const model = parseInt(ryzenMatch[2], 10);
    const gen = Math.floor(model / 1000); // 1..9
    const tierBonus = tier === 9 ? 150 : tier === 7 ? 105 : tier === 5 ? 55 : 0;
    return Math.min(960, 260 + gen * 62 + tierBonus);
  }

  const ryzenShort = clean.match(/ryzen\s*([3579])/i);
  if (ryzenShort) {
    const tier = parseInt(ryzenShort[1], 10);
    return tier === 9 ? 700 : tier === 7 ? 580 : tier === 5 ? 460 : 340;
  }

  // Legacy AMD FX
  const fxMatch = clean.match(/fx[-\s]?([4689]\d{3})/i);
  if (fxMatch) {
    const model = parseInt(fxMatch[1], 10);
    return model >= 8000 ? 220 : 170;
  }

  // Apple M-series
  const appleMatch = clean.match(/\bm([1234])\b/i);
  if (appleMatch) {
    const gen = parseInt(appleMatch[1], 10);
    return 440 + gen * 90;
  }

  if (/pentium|celeron|athlon|core\s*2/i.test(clean)) return 140;
  if (/quad[-\s]*core|4[-\s]*core/i.test(clean)) return 230;
  if (/dual[-\s]*core|2[-\s]*core/i.test(clean)) return 150;

  return null;
}

function scoreRequirementCpu(text: string): number | null {
  if (!text) return null;
  const parts = text.split(/\/|\bor\b|,|\|/i).map((s) => s.trim()).filter(Boolean);
  let lowest: number | null = null;
  for (const p of parts) {
    const s = scoreSingleCpu(p);
    if (s !== null) {
      lowest = lowest === null ? s : Math.min(lowest, s);
    }
  }
  return lowest;
}

export function comparePcWithGameSpec(
  pc: UserPcSpecs,
  spec: SteamSpecData
): PcCompatibilityReport {
  const minOs = findSpecField(spec.minimum, ['os', 'operating']);
  const recOs = findSpecField(spec.recommended, ['os', 'operating']);
  const minCpu = findSpecField(spec.minimum, ['processor', 'cpu']);
  const recCpu = findSpecField(spec.recommended, ['processor', 'cpu']);
  const minRamText = findSpecField(spec.minimum, ['memory', 'ram']);
  const recRamText = findSpecField(spec.recommended, ['memory', 'ram']);
  const minGpu = findSpecField(spec.minimum, ['graphics', 'gpu', 'video']);
  const recGpu = findSpecField(spec.recommended, ['graphics', 'gpu', 'video']);
  const minStorageText = findSpecField(spec.minimum, ['storage', 'disk', 'drive']);
  const recStorageText = findSpecField(spec.recommended, ['storage', 'disk', 'drive']);

  const components: ComponentCheckResult[] = [];

  // 1. OS Check
  let osStatus: ComponentMatchLevel = 'minimum';
  let osNote = 'Compatible 64-bit OS';
  if (minOs || recOs) {
    const reqLower = `${minOs} ${recOs}`.toLowerCase();
    const userIsWin = pc.os.startsWith('Windows');
    if (userIsWin) {
      if (pc.os === 'Windows 11 64-bit' || pc.os === 'Windows 10 64-bit') {
        osStatus = 'recommended';
        osNote = 'គាំទ្រ Windows 10/11 64-bit ពេញលេញ';
      } else if (reqLower.includes('windows 10') || reqLower.includes('windows 11')) {
        osStatus = 'below';
        osNote = 'ហ្គេមនេះទាមទារ Windows 10/11 64-bit';
      } else {
        osStatus = 'minimum';
        osNote = 'អាចដំណើរការលើ Windows 64-bit';
      }
    } else if (
      (pc.os === 'macOS' && !reqLower.includes('mac')) ||
      (pc.os === 'Linux' && !reqLower.includes('linux') && !reqLower.includes('steamos'))
    ) {
      osStatus = 'below';
      osNote = 'ហ្គេមនេះត្រូវការ Windows 64-bit (macOS/Linux អាចត្រូវការ CrossOver/Proton)';
    } else {
      osStatus = 'recommended';
      osNote = 'OS ត្រូវគ្នា';
    }
  } else {
    osStatus = 'unknown';
    osNote = 'Steam មិនបានបញ្ជាក់ OS ទេ';
  }
  components.push({
    key: 'os',
    label: 'OS',
    labelKm: 'ប្រព័ន្ធប្រតិបត្តិការ',
    status: osStatus,
    userValue: pc.os,
    minValue: minOs || '—',
    recValue: recOs || '—',
    note: osNote,
  });

  // 2. CPU Check
  const minCpuScore = scoreRequirementCpu(minCpu);
  const recCpuScore = scoreRequirementCpu(recCpu);
  const userCpuScore = pc.cpu.trim() ? scoreSingleCpu(pc.cpu) : null;

  let cpuStatus: ComponentMatchLevel = 'unknown';
  let cpuNote = 'សូមវាយឈ្មោះ CPU ក្នុងប្រឡោះខាងលើ (ឧ. Core i5-12400F)';
  if (!minCpu && !recCpu) {
    cpuStatus = 'unknown';
    cpuNote = 'Steam មិនបានបញ្ជាក់ CPU ទេ';
  } else if (userCpuScore !== null) {
    if (recCpuScore !== null && userCpuScore >= recCpuScore) {
      cpuStatus = 'recommended';
      cpuNote = 'CPU គ្រប់កម្រិត Recommended';
    } else if (minCpuScore !== null && userCpuScore >= minCpuScore) {
      cpuStatus = 'minimum';
      cpuNote = 'CPU គ្រប់កម្រិត Minimum';
    } else if (minCpuScore !== null) {
      cpuStatus = 'below';
      cpuNote = 'CPU ទាបជាងកម្រិត Minimum របស់ហ្គេម';
    }
  } else if (pc.cpu.trim()) {
    cpuNote = `បានវាយ "${pc.cpu.trim()}" — សាកវាយម៉ូដែលច្បាស់លាស់ (ឧ. Core i5-12400F ឬ Ryzen 5 5600)`;
  }
  components.push({
    key: 'cpu',
    label: 'Processor (CPU)',
    labelKm: 'ស៊ីភីយូ (CPU)',
    status: cpuStatus,
    userValue: pc.cpu.trim() || 'Not entered',
    minValue: minCpu || '—',
    recValue: recCpu || '—',
    note: cpuNote,
  });

  // 3. RAM Check
  const minRam = parseRamGb(minRamText);
  const recRam = parseRamGb(recRamText);
  let ramStatus: ComponentMatchLevel = 'unknown';
  let ramNote = 'សូមវាយទំហំ RAM ក្នុងប្រឡោះខាងលើ (ឧ. 16)';

  if (minRam === null && recRam === null) {
    ramStatus = 'unknown';
    ramNote = 'Steam មិនបានបញ្ជាក់ RAM ទេ';
  } else if (pc.ramGb > 0) {
    if (recRam !== null && pc.ramGb >= recRam) {
      ramStatus = 'recommended';
      ramNote = `RAM ${pc.ramGb} GB គ្រប់កម្រិត Recommended (${recRam} GB)`;
    } else if (minRam !== null && pc.ramGb >= minRam) {
      ramStatus = 'minimum';
      ramNote = `RAM ${pc.ramGb} GB គ្រប់កម្រិត Minimum (${minRam} GB)`;
    } else if (minRam !== null) {
      ramStatus = 'below';
      ramNote = `RAM ${pc.ramGb} GB តិចជាងតម្រូវការ Minimum (${minRam} GB)`;
    }
  }
  components.push({
    key: 'ram',
    label: 'Memory (RAM)',
    labelKm: 'រ៉េម (RAM)',
    status: ramStatus,
    userValue: pc.ramGb > 0 ? `${pc.ramGb} GB` : 'Not entered',
    minValue: minRamText || '—',
    recValue: recRamText || '—',
    note: ramNote,
  });

  // 4. GPU Check
  const minGpuParsed = scoreRequirementGpu(minGpu);
  const recGpuParsed = scoreRequirementGpu(recGpu);
  const userGpuParsed = pc.gpu.trim() ? scoreSingleGpu(pc.gpu) : { score: null, vramGb: null };

  let gpuStatus: ComponentMatchLevel = 'unknown';
  let gpuNote = 'សូមវាយឈ្មោះ GPU ក្នុងប្រឡោះខាងលើ (ឧ. RTX 3060 ឬ GTX 1650)';
  if (!minGpu && !recGpu) {
    gpuStatus = 'unknown';
    gpuNote = 'Steam មិនបានបញ្ជាក់ Graphics Card ទេ';
  } else if (userGpuParsed.score !== null) {
    if (recGpuParsed.score !== null && userGpuParsed.score >= recGpuParsed.score) {
      gpuStatus = 'recommended';
      gpuNote = 'ក្រាហ្វិកកាត (GPU) ខ្លាំងដល់កម្រិត Recommended';
    } else if (minGpuParsed.score !== null && userGpuParsed.score >= minGpuParsed.score) {
      gpuStatus = 'minimum';
      gpuNote = 'ក្រាហ្វិកកាត (GPU) អាចលេងបានកម្រិត Minimum';
    } else if (minGpuParsed.score !== null) {
      gpuStatus = 'below';
      gpuNote = 'ក្រាហ្វិកកាត (GPU) ខ្សោយជាងកម្រិត Minimum របស់ហ្គេម';
    } else if (minGpuParsed.vramGb && userGpuParsed.vramGb) {
      gpuStatus = userGpuParsed.vramGb >= minGpuParsed.vramGb ? 'minimum' : 'below';
      gpuNote = `ផ្ទៀងផ្ទាត់តាម VRAM (${userGpuParsed.vramGb}GB vs ${minGpuParsed.vramGb}GB)`;
    }
  } else if (pc.gpu.trim()) {
    gpuNote = `បានវាយ "${pc.gpu.trim()}" — សាកវាយម៉ូដែលច្បាស់លាស់ (ឧ. RTX 3060 / RX 6600)`;
  }
  components.push({
    key: 'gpu',
    label: 'Graphics (GPU)',
    labelKm: 'ក្រាហ្វិកកាត (GPU)',
    status: gpuStatus,
    userValue: pc.gpu.trim() || 'Not entered',
    minValue: minGpu || '—',
    recValue: recGpu || '—',
    note: gpuNote,
  });

  // 5. Storage Check
  const reqStorageGb = parseStorageGb(minStorageText) ?? parseStorageGb(recStorageText);
  let storageStatus: ComponentMatchLevel = 'unknown';
  let storageNote = 'សូមវាយទំហំ Drive ទំនេរ បើចង់ផ្ទៀងផ្ទាត់';
  if (reqStorageGb === null) {
    storageStatus = 'unknown';
    storageNote = 'Steam មិនបានបញ្ជាក់ទំហំផ្ទុកទេ';
  } else if (pc.storageFreeGb !== undefined && pc.storageFreeGb > 0) {
    if (pc.storageFreeGb >= reqStorageGb) {
      storageStatus = 'recommended';
      storageNote = `ទំហំទំនេរ ${pc.storageFreeGb} GB គ្រប់គ្រាន់ (ហ្គេមត្រូវការ ${reqStorageGb} GB)`;
    } else {
      storageStatus = 'below';
      storageNote = `ទំហំទំនេរ ${pc.storageFreeGb} GB មិនគ្រប់ ${reqStorageGb} GB ទេ`;
    }
  } else {
    storageNote = `ត្រូវការទំហំទំនេរយ៉ាងតិច ${reqStorageGb} GB`;
  }
  components.push({
    key: 'storage',
    label: 'Storage',
    labelKm: 'ទំហំផ្ទុក (SSD/HDD)',
    status: storageStatus,
    userValue: pc.storageFreeGb ? `${pc.storageFreeGb} GB Free` : 'Not entered',
    minValue: minStorageText || '—',
    recValue: recStorageText || '—',
    note: storageNote,
  });

  // Compute Overall Verdict
  const coreStatuses = components
    .filter((c) => c.key !== 'storage' || pc.storageFreeGb !== undefined)
    .map((c) => c.status);

  const hasBelow = coreStatuses.includes('below');
  const knownCore = components.filter((c) =>
    ['os', 'cpu', 'ram', 'gpu'].includes(c.key)
  );
  const allKnownMinimumOrBetter = knownCore.every(
    (c) => c.status === 'recommended' || c.status === 'minimum'
  );
  const allCoreRecommended =
    knownCore.filter((c) => c.key !== 'os').every((c) => c.status === 'recommended') &&
    osStatus !== 'below';

  if (hasBelow) {
    const failedNames = components
      .filter((c) => c.status === 'below')
      .map((c) => c.label.split(' ')[0])
      .join(', ');
    return {
      overall: 'below',
      headlineEn: 'Below Minimum Requirements',
      headlineKm: 'Spec កុំព្យូទ័រមិនទាន់គ្រប់ទេ — អាចលេងមិនរលូន ឬបើកមិនបាន',
      summaryKm: `ផ្នែកដែលទាបជាង Minimum: ${failedNames}`,
      components,
    };
  }

  if (allCoreRecommended && knownCore.some((c) => c.status === 'recommended')) {
    return {
      overall: 'recommended',
      headlineEn: 'Great! Meets Recommended Specs',
      headlineKm: 'លេងបានយ៉ាងរលូន! PC របស់អ្នកគ្រប់ Spec កម្រិត Recommended',
      summaryKm: 'គ្រឿងសំខាន់ៗ (CPU, RAM, GPU, OS) សមស្របល្អសម្រាប់ហ្គេមនេះ។',
      components,
    };
  }

  if (allKnownMinimumOrBetter) {
    return {
      overall: 'minimum',
      headlineEn: 'Playable! Meets Minimum Specs',
      headlineKm: 'អាចលេងបាន! PC របស់អ្នកគ្រប់ Spec កម្រិត Minimum',
      summaryKm: 'អាចដំណើរការហ្គេមបាននៅ Settings កម្រិតទាប-មធ្យម។',
      components,
    };
  }

  return {
    overall: 'partial',
    headlineEn: 'Enter Your PC Specs Above',
    headlineKm: 'សូមវាយបញ្ចូល Spec កុំព្យូទ័ររបស់អ្នកក្នុងប្រឡោះខាងលើ',
    summaryKm: 'វាយ CPU, RAM (GB) និង GPU របស់អ្នកដើម្បីផ្ទៀងផ្ទាត់ជាមួយហ្គេមនេះភ្លាមៗ។',
    components,
  };
}

const aiReportCache = new Map<string, PcCompatibilityReport>();

function buildAiCacheKey(gameName: string, pc: UserPcSpecs): string {
  return JSON.stringify({
    g: gameName.trim().toLowerCase(),
    os: pc.os,
    cpu: pc.cpu.trim().toLowerCase(),
    ram: pc.ramGb,
    gpu: pc.gpu.trim().toLowerCase(),
    sto: pc.storageFreeGb ?? 0,
  });
}

export async function analyzePcCompatibilityWithAi(
  gameName: string,
  pc: UserPcSpecs,
  spec: SteamSpecData
): Promise<PcCompatibilityReport> {
  const key = buildAiCacheKey(gameName, pc);
  const cached = aiReportCache.get(key);
  if (cached) {
    return cached;
  }

  const response = await fetch('/api/pc-compatibility', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameName,
      userPc: pc,
      steamSpec: spec,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `Failed to analyze specs (${response.status}).`);
  }

  if (!payload?.report || !Array.isArray(payload.report.components)) {
    throw new Error('Google AI returned an unexpected response format.');
  }

  const report = payload.report as PcCompatibilityReport;
  aiReportCache.set(key, report);
  return report;
}
