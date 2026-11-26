#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
// filtre_cos_sureleve.js — Filtre passe-haut en cosinus surélevé appliqué à la
// première arrivée à zéro du spectre du WAV d'entrée, puis réexport WAV.
// Usage : node filtre_cos_sureleve.js entree.wav sortie.wav [--beta=0.35] [--seuil=1e-3]
import { readWav, writeWav16, rfftMag, fillRfft, fft } from './dsp.js';

/**
 * Réponse d'un passe-haut en cosinus surélevé dont la transition se termine à fZero.
 * @param {Float64Array} freqs fréquences du spectre
 * @param {number} fZero première fréquence de zéro du spectre (Hz)
 * @param {number} beta roll-off
 * @returns {Float64Array} gain par bin
 */
export function raisedCosineHighpass(freqs, fZero, beta) {
  // H(f) = 0 si f < f1 ; 0.5*(1-cos(pi*(f-f1)/(f2-f1))) entre f1..f2 ; 1 si f > f2
  const f2 = fZero;
  const f1 = fZero * (1 - beta) / (1 + beta);
  const H = new Float64Array(freqs.length);
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i];
    if (f < f1) H[i] = 0;
    else if (f <= f2) H[i] = 0.5 * (1 - Math.cos(Math.PI * (f - f1) / (f2 - f1)));
    else H[i] = 1;
  }
  return H;
}

/**
 * Applique le filtre passe-haut cosinus surélevé à chaque canal et réécrit un WAV 16 bits.
 * @param {string} inputPath WAV d'entrée
 * @param {string} outputPath WAV de sortie
 * @param {number} [beta=0.35] roll-off
 * @param {number} [seuil=1e-3] seuil relatif de détection du zéro spectral
 * @returns {{fZero: number, beta: number, rate: number, frames: number}}
 */
export function filterWav(inputPath, outputPath, beta = 0.35, seuil = 1e-3) {
  const wav = readWav(inputPath);
  const channels = [];
  for (let c = 0; c < wav.channels; c++) {
    const mono = new Float64Array(wav.frames);
    for (let i = 0; i < wav.frames; i++) mono[i] = wav.data[i * wav.channels + c];
    channels.push(mono);
  }
  const ref = channels[0];
  const spec = fillRfft(rfftMag(ref, ref.length), wav.rate);
  let maxMag = 0;
  for (let i = 0; i < spec.mag.length; i++) if (spec.mag[i] > maxMag) maxMag = spec.mag[i];
  let fZero = null;
  for (let i = 1; i < spec.mag.length; i++) { // composante continue exclue
    if (spec.mag[i] <= seuil * maxMag) { fZero = spec.freqs[i]; break; }
  }
  if (fZero === null) throw new Error('aucune fréquence de zéro trouvée dans le spectre');
  const H = raisedCosineHighpass(spec.freqs, fZero, beta);

  const outChannels = channels.map(mono => {
    const s = fillRfft(rfftMag(mono, mono.length), wav.rate);
    const N = s.N;
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < s.mag.length; i++) {
      re[i] = s.re[i] * H[i]; im[i] = s.im[i] * H[i];
      // miroir conjugué pour le spectre réel
      if (i > 0 && i < N / 2) { re[N - i] = re[i]; im[N - i] = -im[i]; }
    }
    // ifft
    for (let i = 0; i < N; i++) im[i] = -im[i];
    fft(re, im);
    for (let i = 0; i < N; i++) im[i] = -im[i];
    const out = new Float64Array(mono.length);
    for (let i = 0; i < mono.length; i++) out[i] = re[i] / N;
    return out;
  });
  writeWav16(outputPath, wav.rate, outChannels);
  return { fZero, beta, rate: wav.rate, frames: wav.frames };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const beta = Number(args.find(a => a.startsWith('--beta='))?.split('=')[1] ?? 0.35);
  const seuil = Number(args.find(a => a.startsWith('--seuil='))?.split('=')[1] ?? 1e-3);
  const [entree, sortie] = args.filter(a => !a.startsWith('--'));
  if (!entree || !sortie) { console.error('Usage : node filtre_cos_sureleve.js entree.wav sortie.wav [--beta=0.35] [--seuil=1e-3]'); process.exit(1); }
  const r = filterWav(entree, sortie, beta, seuil);
  console.log(`OK ${sortie}  f_zero=${r.fZero.toFixed(2)} Hz  beta=${r.beta}  rate=${r.rate}  frames=${r.frames}`);
}
