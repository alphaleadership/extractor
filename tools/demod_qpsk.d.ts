// demod_qpsk.d.ts — types du démodulateur QPSK.
export interface Complex { re: number; im: number }
export interface DemodOptions {
  sps?: number | null;
  baud?: number | null;
  freq?: number | null;
  offset?: number | null;
  sync?: boolean;
  maxBits?: number;
}
export interface DemodResult {
  file: string;
  rate: number;
  sps: number;
  offset: number;
  carrierHz: number;
  phaseCorrectionDeg: number;
  numSymbols: number;
  evm: number;
  snrDb: number;
  bits: string;
  hex: string;
  ascii: string;
  symbols: Complex[];
  metrics: Record<string, unknown>;
}
export const QPSK_POINTS: Complex[];
export const QPSK_BITS: number[][];
export const MAPPINGS: Record<string, number[][]>;
export function rrcTaps(sps: number, beta: number, mult?: number): Float64Array;
export function rrcMatchedFilter(samples: Complex[], fs: number, baud: number, beta?: number): Complex[];
export function bandpassFilter(samples: Complex[], fs: number, centerHz: number, bandwidthHz: number, order?: number): Complex[];
export function removeCarrierFreq(samples: Complex[], fs: number, freqHz?: number | null): { samples: Complex[]; freqEst: number };
export function alignConstellation(samples: Complex[]): { samples: Complex[]; corrDeg: number };
export function estimateSps(samples: Complex[], fs: number, minSps?: number, maxSps?: number): number;
export function findBestOffset(samples: Complex[], sps: number): number;
export function sampleSymbolsFrac(samples: Complex[], spsFloat: number, offsetFrac?: number): Complex[];
export function scanSps(samples: Complex[], fs: number, minSps?: number, maxSps?: number, topN?: number): Array<{ sps: number; offset: number; evmPct: number; snrDb: number; baud: number }>;
export function findBestOffsetFrac(samples: Complex[], spsFloat: number, nSteps?: number): { offset: number; evm: number };
export function qpskDecide(symbols: Complex[]): { decided: Complex[]; indices: number[]; bits: number[] };
export function computeMetrics(symbols: Complex[], decided: Complex[], bits: number[]): Record<string, unknown>;
export function bitsToBytes(bits: number[]): number[];
export function bytesToHex(d: number[], limit?: number): string;
export function bytesToAscii(d: number[], limit?: number): string;
export function findSync(bits: number[], preamble?: string): number;
export function decodeBestText(indices: number[], marker?: string): Record<string, unknown>;
export function recomposeQpsk(decided: Complex[], spsFloat: number, fs: number, offset?: number, rrcBeta?: number | null): Complex[];
export function saveRecomposedWav(decided: Complex[], spsFloat: number, fs: number, file: string, offset?: number): string;
export function decodeBpskVoie(voie: ArrayLike<number>, fs: number, baud: number, marker?: string | null, tol?: number): Record<string, unknown>;
export function mergeIqTrain(chaineI: Buffer, chaineQ: Buffer, searchShift?: boolean): { train: Buffer; shift: number; score: number };
export function decodeB64Payload(train: Buffer): { text: string | null; nums: number[] };
export function writePixelsTxt(nums: number[], txtPath: string, rawText?: string | null): number;
export function demodQpsk(file: string, opts?: DemodOptions): DemodResult;
