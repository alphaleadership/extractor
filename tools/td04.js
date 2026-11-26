#!/usr/bin/env node
// td04.js — TD04 : chaîne pulse train → filtre cosinus surélevé → mise en forme,
// plus estimation de fréquence (pic FFT grossier + boucle de Costas fine).
// Usage :
//   node td04.js step1 [--symbols=100] [--sps=8]
//   node td04.js step2 [--taps=103] [--beta=0.35] [--sps=8]
//   node td04.js step3 [--symbols=100] [--sps=8]
//   node td04.js guess <fichier.wav>
import { pathToFileURL } from 'node:url';
import { readWav, toMono, rfftMag, fillRfft, raisedCosineTaps, convolve } from './dsp.js';

/**
 * TD04 étape 1 : génère un train d'impulsions (pulse train) à partir de bits aléatoires.
 * @param {number} [numSymbols=100]
 * @param {number} [sps=8] échantillons par symbole
 * @returns {{bits: number[], pulse: Float64Array}}
 */
export function step1(numSymbols = 100, sps = 8) {
  const bits = Array.from({ length: numSymbols }, () => Math.floor(Math.random() * 2));
  const pulse = new Float64Array(numSymbols * sps);
  bits.forEach((b, i) => { pulse[i * sps] = b * 2 - 1; });
  return { bits, pulse };
}

/**
 * TD04 étape 2 : coefficients du filtre en cosinus surélevé.
 * @param {number} [numTaps=103]
 * @param {number} [beta=0.35]
 * @param {number} [sps=8]
 * @returns {Float64Array}
 */
export function step2(numTaps = 103, beta = 0.35, sps = 8) {
  return raisedCosineTaps(numTaps, beta, sps);
}

/**
 * TD04 étape 3 : applique la mise en forme (convolution pulse train × filtre RRC).
 * @param {number} [numSymbols=100]
 * @param {number} [sps=8]
 * @param {number} [numTaps=103]
 * @param {number} [beta=0.35]
 * @returns {Float64Array}
 */
export function step3(numSymbols = 100, sps = 8, numTaps = 103, beta = 0.35) {
  const { pulse } = step1(numSymbols, sps);
  const h = step2(numTaps, beta, sps);
  return convolve(pulse, h);
}

/** Estimation grossière : pic du spectre. */
/**
 * Estimation grossière de la fréquence dominante : pic du spectre (FFT).
 * @param {number} rate fréquence d'échantillonnage (Hz)
 * @param {Float64Array} x signal réel
 * @returns {number} fréquence du pic (Hz)
 */
export function coarseFreq(rate, x) {
  const spec = fillRfft(rfftMag(x, x.length), rate);
  let mi = 0;
  for (let i = 1; i < spec.mag.length; i++) if (spec.mag[i] > spec.mag[mi]) mi = i;
  return spec.freqs[mi];
}

/** Boucle de Costas : résidu de fréquence après décalage. */
/**
 * Boucle de Costas : estime le résidu de fréquence après décalage à f0.
 * @param {number} rate fréquence d'échantillonnage (Hz)
 * @param {Float64Array} re partie réelle (normalisée)
 * @param {Float64Array} im partie imaginaire
 * @param {number} f0 fréquence grossière (Hz)
 * @param {number} [alpha=0.05] gain proportionnel
 * @param {number} [beta=0.01] gain intégral
 * @param {number} [maxN=200000] nombre max d'échantillons traités
 * @returns {{residuHz: number, log: number[]}}
 */
export function costas(rate, re, im, f0, alpha = 0.05, beta = 0.01, maxN = 200000) {
  const n = Math.min(re.length, maxN);
  let freq = 0, phase = 0;
  const log = [];
  for (let i = 0; i < n; i++) {
    const w = -2 * Math.PI * f0 * i / rate;
    const c = Math.cos(w + phase), s = Math.sin(w + phase);
    const ore = re[i] * c - im[i] * s;
    const oim = re[i] * s + im[i] * c;
    const error = ore * oim;
    freq += beta * error;
    phase += freq + alpha * error;
    while (phase >= 2 * Math.PI) phase -= 2 * Math.PI;
    while (phase < 0) phase += 2 * Math.PI;
    if (i % 100 === 0) log.push(freq / (2 * Math.PI) * rate);
  }
  return { residuHz: freq / (2 * Math.PI) * rate, log };
}

/**
 * Estime la fréquence d'un WAV : pic FFT grossier + résidu de la boucle de Costas.
 * @param {string} path chemin du WAV
 * @returns {{file: string, rate: number, coarseHz: number, residuHz: number, estimeHz: number}}
 */
export function guessFreq(path) {
  const wav = readWav(path);
  const x = toMono(wav);
  const mean = x.reduce((a, b) => a + b, 0) / x.length;
  const re = new Float64Array(x.length), im = new Float64Array(x.length);
  const scale = wav.sampwidth === 2 ? 32768 : wav.sampwidth === 4 ? 2147483648 : 128;
  for (let i = 0; i < x.length; i++) re[i] = (x[i] - mean) / scale;
  const f0 = coarseFreq(wav.rate, re);
  const { residuHz } = costas(wav.rate, re, im, f0);
  return { file: path, rate: wav.rate, coarseHz: f0, residuHz, estimeHz: f0 + residuHz };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = name => rest.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
  if (cmd === 'step1') {
    const r = step1(Number(opt('symbols') ?? 100), Number(opt('sps') ?? 8));
    console.log(JSON.stringify({ bits: r.bits.join(''), pulseLen: r.pulse.length }));
  } else if (cmd === 'step2') {
    const h = step2(Number(opt('taps') ?? 103), Number(opt('beta') ?? 0.35), Number(opt('sps') ?? 8));
    console.log(JSON.stringify({ taps: [...h].map(v => +v.toFixed(6)) }));
  } else if (cmd === 'step3') {
    const s = step3(Number(opt('symbols') ?? 100), Number(opt('sps') ?? 8));
    console.log(JSON.stringify({ len: s.length, first10: [...s.slice(0, 10)].map(v => +v.toFixed(4)) }));
  } else if (cmd === 'guess') {
    const file = rest.find(a => !a.startsWith('--'));
    if (!file) { console.error('Usage : node td04.js guess <fichier.wav>'); process.exit(1); }
    console.log(JSON.stringify(guessFreq(file), null, 2));
  } else {
    console.error('Usage : node td04.js step1|step2|step3|guess ...');
    process.exit(1);
  }
}
