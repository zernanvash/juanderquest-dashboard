export type Random = () => number;
export type DrawBanner = (ctx: CanvasRenderingContext2D, t: number, dt: number) => void;
export type BannerGenerator = { create: (rng: Random, width: number, height: number, colors: string[]) => DrawBanner };
export type GeneratorId = 'sunset' | 'islands' | 'bangus' | 'banderitas' | 'asin' | 'topo' | 'habi' | 'alitaptap';

export const mulberry32 = (seed: number): Random => () => {
  let a = seed | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const fnv1a32 = (value: string): number => {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const rgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16),
];
export const rgba = (hex: string, alpha: number): string => {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
};
export const mix = (a: number[], b: number[], t: number): number[] => a.map((v, i) => v + (b[i] - v) * t);
export const clamp = (x: number, min = 0, max = 1): number => x < min ? min : x > max ? max : x;
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export const makeNoise = (rng: Random) => {
  const p = new Uint16Array(512);
  const values = new Float32Array(256);
  for (let i = 0; i < 256; i += 1) { p[i] = i; values[i] = rng(); }
  for (let i = 255; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 256; i += 1) p[i + 256] = p[i];
  return (x: number, y: number): number => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
    const a = values[p[p[X] + Y]], b = values[p[p[X + 1] + Y]], c = values[p[p[X] + Y + 1]], d = values[p[p[X + 1] + Y + 1]];
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
};

export const fbm = (noise: (x: number, y: number) => number, x: number, y: number, octaves = 5): number => {
  let sum = 0, amplitude = 0.5, frequency = 1, max = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amplitude * noise(x * frequency + i * 17.3, y * frequency - i * 9.1);
    max += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum / max;
};

export const offscreenCanvas = (width: number, height: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

export const paletteColors: Record<GeneratorId, Record<string, string[]>> = {
  sunset: { golden: ['#2b2a5c','#c8577a','#f6a85a','#ffe2a0','#3c3a6b','#141634'], ember: ['#3b1027','#a8323e','#f27b3f','#ffd27a','#5a1f2f','#1c0b14'] },
  islands: { midday: ['#0a3a5a','#1792ad','#73dccd','#efdcae','#2c6637','#68a952'], dusk: ['#1a1c47','#355c8e','#8fb3c8','#e6bf93','#213b2b','#4b7448'] },
  bangus: { silver: ['#0f5e72','#06283a','#2d4c63','#dfe9ee','#9ee7f0'], gilded: ['#11403f','#041a1c','#6b5a24','#f6e7b4','#ffe7a3'] },
  banderitas: { fiesta: ['#3fa7d6','#bfe7f2','#e63946','#f4c430','#2a9d8f','#f1faee'], pastel: ['#9bb7e0','#f3e6f0','#f28fad','#ffd56b','#7fd1b9','#ffffff'] },
  asin: { noon: ['#b8c3c9','#f7f8f6','#eef2f6','#f6eef0','#ffffff'], brine: ['#6b8794','#d5e8ee','#c3dde8','#e9dcd8','#ffffff'] },
  topo: { field: ['#eef0e2','#a9b48d','#6f7d55','#d24b2a','#1d5c46'], night: ['#13201b','#2d4a3d','#4f7a63','#ffb547','#9ff0c8'] },
  habi: { indigo: ['#f2ebdc','#1f3a6b','#b5352b','#e1a93a','#13284d'], kalinga: ['#1b1210','#c7372f','#f2e6cf','#e2b23a','#7a1e18'] },
  alitaptap: { night: ['#050b1a','#12233a','#04070d','#d8ff7a','#0a1a26'], teal: ['#04131a','#0f3a44','#020a0c','#9cffd6','#06222a'] },
};

export const isGeneratorId = (value: unknown): value is GeneratorId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(paletteColors, value);
