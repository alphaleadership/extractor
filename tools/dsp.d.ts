// dsp.d.ts — types du noyau DSP partagé.
export interface WavData {
  rate: number;
  channels: number;
  sampwidth: number;
  frames: number;
  data: Float64Array;
}
export interface RfftResult {
  freqs: Float64Array;
  mag: Float64Array;
  re: Float64Array;
  im: Float64Array;
  N: number;
}
export interface IQ {
  re: Float64Array;
  im: Float64Array;
  rate: number;
}
export function readWav(path: string): WavData;
export function writeWav16(path: string, rate: number, channelsData: Float64Array[]): void;
export function fft(re: Float64Array, im: Float64Array): void;
export function nextPow2(n: number): number;
export function rfftMag(data: ArrayLike<number>, n: number): RfftResult;
export function fillRfft(out: RfftResult, rate: number): RfftResult;
export function raisedCosineTaps(numTaps: number, beta: number, Ts: number): Float64Array;
export function convolve(x: ArrayLike<number>, h: ArrayLike<number>): Float64Array;
export function toMono(wav: WavData): Float64Array;
export function stereoToIQ(wav: WavData): IQ;
