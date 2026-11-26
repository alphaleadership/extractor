// td04.d.ts — types des outils TD04.
export function step1(numSymbols?: number, sps?: number): { bits: number[]; pulse: Float64Array };
export function step2(numTaps?: number, beta?: number, sps?: number): Float64Array;
export function step3(numSymbols?: number, sps?: number, numTaps?: number, beta?: number): Float64Array;
export function coarseFreq(rate: number, x: ArrayLike<number>): number;
export function costas(rate: number, re: ArrayLike<number>, im: ArrayLike<number>, f0: number, alpha?: number, beta?: number, maxN?: number): { residuHz: number; log: number[] };
export function guessFreq(path: string): { file: string; rate: number; coarseHz: number; residuHz: number; estimeHz: number };
