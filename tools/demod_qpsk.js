#!/usr/bin/env node
// demod_qpsk.js — Démodulateur QPSK complet pour fichier WAV (portage JS de demod_qpsk.py).
// Stéréo 16 bits : canal 1 = I, canal 2 = Q. Mono : signal réel.
// Usage : node demod_qpsk.js fichier.wav [--sps=N] [--baud=B] [--scan] [--scan-baud=7800-7820]
//          [--offset=N] [--freq=Hz] [--hp=Hz] [--bw=Hz] [--rrc[=beta]] [--bits] [--json]
//          [--sync] [--recompose] [--swap-iq] [--split-iq] [--merge-iq] [--marker=//]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { readWav, writeWav16, stereoToIQ } from './dsp.js';

// ---------- helpers complexes ----------
const c = (re, im = 0) => ({ re, im });
const cadd = (a, b) => c(a.re + b.re, a.im + b.im);
const cmul = (a, b) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cabs = a => Math.hypot(a.re, a.im);
const cexp = t => c(Math.cos(t), Math.sin(t));
const cpow4 = a => { const z = cmul(a, a); return cmul(z, z); };
const carg = a => Math.atan2(a.im, a.re);

function toComplex(wav) {
  const scale = 2 ** (8 * wav.sampwidth - 1);
  if (wav.channels === 2) {
    const { re, im, rate } = stereoToIQ(wav); // tronque à un nombre pair de trames
    const out = new Array(re.length);
    for (let i = 0; i < re.length; i++) out[i] = c(re[i] / scale, im[i] / scale);
    return { samples: out, fs: rate, mode: 'complexe I/Q (stereo)' };
  }
  const out = new Array(wav.frames);
  for (let i = 0; i < wav.frames; i++) out[i] = c(wav.data[i] / scale, 0);
  return { samples: out, fs: wav.rate, mode: 'reel mono -> complexe' };
}

function normalize(samples) {
  let mr = 0, mi = 0;
  for (const s of samples) { mr += s.re; mi += s.im; }
  mr /= samples.length; mi /= samples.length;
  let p = 0;
  for (const s of samples) p += (s.re - mr) ** 2 + (s.im - mi) ** 2;
  p = Math.sqrt(p / samples.length);
  if (p <= 0) return samples;
  return samples.map(s => c((s.re - mr) / p, (s.im - mi) / p));
}

// ---------- filtres (biquads Butterworth, filtfilt) ----------
/**
 * Conçoit une cascade de biquads Butterworth passe-bas d'ordre `order`
 * (pôles sur le cercle unité, transformée bilinéaire), fréquence de coupure
 * normalisée `w0` (0..1, 1 = Nyquist).
 * @param {number} order ordre du filtre
 * @param {number} w0 fréquence de coupure normalisée
 * @returns {Array<{b: number[], a: number[]}>} biquads {b:[b0,b1,b2], a:[1,a1,a2]}
 */
function butterLowpassBiquads(order, w0) {
  const poles = [];
  for (let k = 0; k < order; k++) {
    const th = Math.PI * (2 * k + 1) / (2 * order);
    poles.push({ re: Math.cos(th), im: Math.sin(th) });
  }
  const out = [];
  const K = 2 / Math.tan(Math.PI * w0); // constante bilinéaire (fe=1)
  for (let i = 0; i + 1 < poles.length; i += 2) {
    const pr = poles[i].re, pi = poles[i].im;
    const d0 = K * K - 2 * pr * K + (pr * pr + pi * pi);
    out.push({
      b: [1 / d0, 2 / d0, 1 / d0],
      a: [1, 2 * (pr * pr + pi * pi - K * K) / d0, (K * K + 2 * pr * K + (pr * pr + pi * pi)) / d0],
    });
  }
  if (order % 2 === 1) {
    const p = poles[order - 1];
    const d0 = K - p.re;
    out.push({ b: [1 / d0, 1 / d0], a: [1, (K + p.re) / d0] });
  }
  return out;
}

function applyBiquadFiltfilt(x, bq) {
  const n = x.length;
  const fwd = new Float64Array(n), out = new Float64Array(n);
  let z1 = 0, z2 = 0;
  for (let i = 0; i < n; i++) {
    const y = bq.b[0] * x[i] + z1;
    z1 = bq.b[1] * x[i] - bq.a[1] * y + z2;
    z2 = bq.b[2] * x[i] - bq.a[2] * y;
    fwd[i] = y;
  }
  z1 = 0; z2 = 0;
  for (let i = n - 1; i >= 0; i--) {
    const y = bq.b[0] * fwd[i] + z1;
    z1 = bq.b[1] * fwd[i] - bq.a[1] * y + z2;
    z2 = bq.b[2] * fwd[i] - bq.a[2] * y;
    out[i] = y;
  }
  return out;
}

function filtfiltReal(x, order, w0, highpass = false) {
  const bqs = butterLowpassBiquads(order, w0);
  let y = x;
  for (const bq of bqs) y = applyBiquadFiltfilt(y, highpass ? highpassBiquad(bq) : bq);
  return y;
}
function highpassBiquad(bq) { // HP = delay - LP (approximation par réseau)
  return { b: [1 - bq.b[0], -bq.b[1], -bq.b[2]], a: bq.a };
}

function removeDcAndLowfreq(samples, fs, cutoffHz = 0) {
  let mr = 0, mi = 0;
  for (const s of samples) { mr += s.re; mi += s.im; }
  mr /= samples.length; mi /= samples.length;
  let out = samples.map(s => c(s.re - mr, s.im - mi));
  if (cutoffHz > 0 && cutoffHz < fs / 2) {
    const w0 = cutoffHz / (fs / 2);
    const re = new Float64Array(out.length), im = new Float64Array(out.length);
    for (let i = 0; i < out.length; i++) { re[i] = out[i].re; im[i] = out[i].im; }
    const fre = filtfiltReal(re, 4, w0, true), fim = filtfiltReal(im, 4, w0, true);
    out = out.map((_, i) => c(fre[i], fim[i]));
  }
  return { samples: out, dc: c(mr, mi) };
}

// ---------- filtre adapté RRC ----------
/**
 * Coefficients d'un filtre root-raised-cosine (mise en forme / filtre adapté).
 * @param {number} sps échantillons par symbole
 * @param {number} beta roll-off (0..1)
 * @param {number} [mult=10] nombre de symboles de la réponse impulsionnelle
 * @returns {Float64Array} coefficients normalisés (énergie unité)
 */
export function rrcTaps(sps, beta, mult = 10) {
  const ntaps = sps * mult + 1;
  const t = new Float64Array(ntaps);
  const mid = ntaps >> 1;
  for (let i = 0; i < ntaps; i++) t[i] = (i - mid) / sps;
  const h = new Float64Array(ntaps);
  for (let i = 0; i < ntaps; i++) {
    const ti = t[i];
    if (Math.abs(ti) < 1e-10) h[i] = 1 - beta + 4 * beta / Math.PI;
    else if (beta > 0 && Math.abs(Math.abs(ti) - 1 / (4 * beta)) < 1e-10) {
      h[i] = (beta / Math.SQRT2) * ((1 + 2 / Math.PI) * Math.sin(Math.PI / (4 * beta)) +
        (1 - 2 / Math.PI) * Math.cos(Math.PI / (4 * beta)));
    } else {
      h[i] = (Math.sin(Math.PI * ti * (1 - beta)) + 4 * beta * ti * Math.cos(Math.PI * ti * (1 + beta))) /
        (Math.PI * ti * (1 - (4 * beta * ti) ** 2));
    }
  }
  let e = 0; for (const v of h) e += v * v;
  e = Math.sqrt(e);
  for (let i = 0; i < ntaps; i++) h[i] /= e;
  return h;
}

function convolveSameComplex(x, h) {
  const n = x.length;
  const out = new Array(n);
  const mid = h.length >> 1;
  for (let i = 0; i < n; i++) {
    let sr = 0, si = 0;
    for (let j = 0; j < h.length; j++) {
      const k = i + j - mid;
      if (k >= 0 && k < n) { sr += h[j] * x[k].re; si += h[j] * x[k].im; }
    }
    out[i] = c(sr, si);
  }
  return out;
}

/**
 * Filtre adapté RRC appliqué en mode same à un signal complexe.
 * @param {Array<{re:number, im:number}>} samples signal complexe
 * @param {number} fs fréquence d'échantillonnage (Hz)
 * @param {number} baud débit symbole (Baud)
 * @param {number} [beta=0.35] roll-off
 * @returns {Array<{re:number, im:number}>}
 */
export function rrcMatchedFilter(samples, fs, baud, beta = 0.35) {
  if (!(baud > 0)) return samples;
  const sps = Math.max(2, Math.round(fs / baud));
  return convolveSameComplex(samples, rrcTaps(sps, beta));
}

// ---------- passe-bande (bande de base: passe-bas sur I et Q) ----------
/**
 * Passe-bas symétrique sur I et Q (signal complexe en bande de base), équivalent passe-bande de largeur bandwidthHz.
 * @param {Array<{re:number, im:number}>} samples signal complexe
 * @param {number} fs fréquence d'échantillonnage (Hz)
 * @param {number} centerHz fréquence centrale (0 = bande de base)
 * @param {number} bandwidthHz largeur de bande (Hz)
 * @param {number} [order=6] ordre de Butterworth
 * @returns {Array<{re:number, im:number}>}
 */
export function bandpassFilter(samples, fs, centerHz, bandwidthHz, order = 6) {
  if (!(bandwidthHz > 0) || bandwidthHz >= fs) return samples;
  let cutoff = bandwidthHz / 2;
  cutoff = Math.min(cutoff, fs / 2 - 1);
  const w0 = cutoff / (fs / 2);
  const bqs = butterLowpassBiquads(order, w0);
  const re = new Float64Array(samples.length), im = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) { re[i] = samples[i].re; im[i] = samples[i].im; }
  let fr = re, fi = im;
  for (const bq of bqs) { fr = applyBiquadFiltfilt(fr, bq); fi = applyBiquadFiltfilt(fi, bq); }
  return samples.map((_, i) => c(fr[i], fi[i]));
}

// ---------- suppression porteuse (x^4) ----------
/**
 * Suppression de la dérive de porteuse par la méthode x^4 (pente de phase), ou décalage fixe si freqHz est fourni.
 * @param {Array<{re:number, im:number}>} samples signal complexe normalisé
 * @param {number} fs fréquence d'échantillonnage (Hz)
 * @param {number|null} [freqHz=null] porteuse à supprimer (null = estimation auto)
 * @returns {{samples: Array, freqEst: number}} signal corrigé et fréquence estimée (Hz)
 */
export function removeCarrierFreq(samples, fs, freqHz = null) {
  const n = samples.length;
  if (freqHz != null) {
    return {
      samples: samples.map((s, i) => cmul(s, cexp(-2 * Math.PI * freqHz * i / fs))),
      freqEst: freqHz,
    };
  }
  // pente de la phase de x^4 (moindres carrés)
  const ph = new Float64Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) { const p = carg(cpow4(samples[i])); ph[i] = prev + ((((p - prev + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI); prev = ph[i]; }
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += ph[i]; sxx += i * i; sxy += i * ph[i]; }
  const slope = n > 1 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : 0;
  const fOffset = slope / (4 * 2 * Math.PI);
  return { samples: samples.map((s, i) => cmul(s, cexp(-2 * Math.PI * fOffset * i))), freqEst: fOffset * fs };
}

// ---------- alignement constellation ----------
/**
 * Aligne la constellation QPSK sur les points standard (45, 135, 225, 315 degrés) via mean(x^4).
 * @param {Array<{re:number, im:number}>} samples symboles
 * @returns {{samples: Array, corrDeg: number}} symboles alignés et correction appliquée (degrés)
 */
export function alignConstellation(samples) {
  let sr = 0, si = 0;
  for (const s of samples) { const z = cpow4(s); sr += z.re; si += z.im; }
  const m = c(sr / samples.length, si / samples.length);
  if (cabs(m) < 1e-12) return { samples, corrDeg: 0 };
  const cur = carg(m) / 4;
  const corr = ((Math.PI / 4 - cur + Math.PI / 4) % (Math.PI / 2) + (Math.PI / 2)) % (Math.PI / 2) - Math.PI / 4;
  return { samples: samples.map(s => cmul(s, cexp(corr))), corrDeg: corr * 180 / Math.PI };
}

// ---------- estimation SPS ----------
/**
 * Estime le SPS via la raie spectrale de |x|^4 à fs/SPS.
 * @param {Array<{re:number, im:number}>} samples signal complexe
 * @param {number} fs fréquence d'échantillonnage (Hz)
 * @param {number} [minSps=2]
 * @param {number} [maxSps=64]
 * @returns {number} SPS estimé
 */
export function estimateSps(samples, fs, minSps = 2, maxSps = 64) {
  const n = samples.length;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = cabs(samples[i]) ** 4;
  const mean = x.reduce((a, b) => a + b, 0) / n;
  let nfft = 1024; while (nfft < n * 4) nfft <<= 1;
  // FFT de x (réel)
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  for (let i = 0; i < n; i++) re[i] = x[i] - mean;
  fftLocal(re, im);
  let bestSps = 8, bestVal = 0;
  for (let sps = minSps; sps <= maxSps; sps++) {
    const idx = Math.round(nfft / sps);
    if (idx < 1 || idx >= nfft / 2) continue;
    const w = Math.abs(re[idx - 1]) + Math.abs(re[idx]) + Math.abs(re[idx + 1]);
    if (w > bestVal) { bestVal = w; bestSps = sps; }
  }
  return bestSps;
}
function fftLocal(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wre = Math.cos(ang), wim = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ure = re[i + k], uim = im[i + k];
        const vre = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vim = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ure + vre; im[i + k] = uim + vim;
        re[i + k + len / 2] = ure - vre; im[i + k + len / 2] = uim - vim;
        const nr = cr * wre - ci * wim; ci = cr * wim + ci * wre; cr = nr;
      }
    }
  }
}

// ---------- timing ----------
/**
 * Offset d'échantillonnage maximisant la propreté des symboles (variance d'amplitude minimale).
 * @param {Array<{re:number, im:number}>} samples
 * @param {number} sps échantillons par symbole
 * @returns {number} meilleur offset dans [0, sps)
 */
export function findBestOffset(samples, sps) {
  let bestOff = 0, bestScore = -Infinity;
  for (let off = 0; off < sps; off++) {
    const amps = [];
    for (let i = off; i < samples.length; i += sps) amps.push(cabs(samples[i]));
    if (amps.length < 4) continue;
    const m = amps.reduce((a, b) => a + b, 0) / amps.length;
    const v = amps.reduce((a, b) => a + (b - m) ** 2, 0) / amps.length;
    if (-v > bestScore) { bestScore = -v; bestOff = off; }
  }
  return bestOff;
}

/**
 * Échantillonnage des symboles avec un SPS fractionnaire (interpolation linéaire).
 * @param {Array<{re:number, im:number}>} samples
 * @param {number} spsFloat SPS fractionnaire
 * @param {number} [offsetFrac=0] offset initial
 * @returns {Array<{re:number, im:number}>} symboles
 */
export function sampleSymbolsFrac(samples, spsFloat, offsetFrac = 0) {
  const n = samples.length;
  const out = [];
  for (let pos = offsetFrac; pos < n; pos += spsFloat) {
    const i0 = Math.floor(pos), fr = pos - i0;
    const i1 = Math.min(i0 + 1, n - 1);
    out.push(c(samples[i0].re * (1 - fr) + samples[i1].re * fr, samples[i0].im * (1 - fr) + samples[i1].im * fr));
  }
  return out;
}

function evmOf(symbols) {
  let sr = 0, si = 0;
  for (const s of symbols) { const z = cpow4(s); sr += z.re; si += z.im; }
  const ph = carg(c(sr / symbols.length, si / symbols.length)) / 4;
  const corr = ((Math.PI / 4 - ph + Math.PI / 4) % (Math.PI / 2) + (Math.PI / 2)) % (Math.PI / 2) - Math.PI / 4;
  let acc = 0;
  for (const s of symbols) {
    const sy = cmul(s, cexp(corr));
    let bd = Infinity;
    for (const p of QPSK_POINTS) { const d = cabs(c(sy.re - p.re, sy.im - p.im)); if (d < bd) bd = d; }
    acc += bd * bd;
  }
  return Math.sqrt(acc / symbols.length);
}

/**
 * Balaye tous les SPS de minSps à maxSps et classe par EVM croissant.
 * @param {Array<{re:number, im:number}>} samples
 * @param {number} fs fréquence d'échantillonnage (Hz)
 * @param {number} [minSps=2]
 * @param {number} [maxSps=200]
 * @param {number} [topN=10]
 * @returns {Array<{sps:number, offset:number, evmPct:number, snrDb:number, baud:number}>}
 */
export function scanSps(samples, fs, minSps = 2, maxSps = 200, topN = 10) {
  const results = [];
  for (let sps = minSps; sps <= maxSps; sps++) {
    let bestEvm = Infinity, bestOff = 0;
    for (let off = 0; off < sps; off++) {
      const sym = [];
      for (let i = off; i < samples.length; i += sps) sym.push(samples[i]);
      if (sym.length < 10) continue;
      const e = evmOf(sym);
      if (e < bestEvm) { bestEvm = e; bestOff = off; }
    }
    if (bestEvm < Infinity) {
      results.push({
        sps, offset: bestOff, evmPct: +(bestEvm * 100).toFixed(2),
        snrDb: bestEvm > 1e-10 ? +(-20 * Math.log10(bestEvm)).toFixed(2) : 99,
        baud: +(fs / sps).toFixed(1),
      });
    }
  }
  results.sort((a, b) => a.evmPct - b.evmPct);
  return results.slice(0, topN);
}

/**
 * Recherche l'offset fractionnaire optimal en testant nSteps positions dans [0, sps).
 * @param {Array} samples
 * @param {number} spsFloat
 * @param {number} [nSteps=50]
 * @returns {{offset: number, evm: number}}
 */
export function findBestOffsetFrac(samples, spsFloat, nSteps = 50) {
  let bestOff = 0, bestEvm = Infinity;
  for (let k = 0; k < nSteps; k++) {
    const off = k * spsFloat / nSteps;
    const sym = sampleSymbolsFrac(samples, spsFloat, off);
    if (sym.length < 10) continue;
    const e = evmOf(sym);
    if (e < bestEvm) { bestEvm = e; bestOff = off; }
  }
  return { offset: bestOff, evm: bestEvm };
}

// ---------- décision QPSK ----------
export const QPSK_POINTS = [1, 3, 5, 7].map(k => cexp(k * Math.PI / 4));
export const QPSK_BITS = [[0, 0], [0, 1], [1, 1], [1, 0]]; // Gray
export const MAPPINGS = { gray: QPSK_BITS, naturel: [[0, 0], [0, 1], [1, 0], [1, 1]] };

/**
 * Décision dure QPSK par plus proche voisin (constellation Gray).
 * @param {Array<{re:number, im:number}>} symbols
 * @returns {{decided: Array, indices: number[], bits: number[]}} symboles décidés, indices 0..3, bits (2 par symbole)
 */
export function qpskDecide(symbols) {
  const decided = [], indices = [], bits = [];
  for (const s of symbols) {
    let bi = 0, bd = Infinity;
    for (let j = 0; j < 4; j++) {
      const d = cabs(c(s.re - QPSK_POINTS[j].re, s.im - QPSK_POINTS[j].im));
      if (d < bd) { bd = d; bi = j; }
    }
    decided.push(QPSK_POINTS[bi]);
    indices.push(bi);
    bits.push(...QPSK_BITS[bi]);
  }
  return { decided, indices, bits };
}

// ---------- métriques / bits ----------
/**
 * Métriques de qualité : EVM, SNR estimé, entropie des bits, répartition des symboles.
 * @param {Array} symbols symboles échantillonnés
 * @param {Array} decided symboles décidés
 * @param {number[]} bits bits extraits
 * @returns {{EVM_percent:number, SNR_estime_db:number|string, nb_symboles:number, nb_bits:number, entropie_bits:number, repartition_symboles:number[]}}
 */
export function computeMetrics(symbols, decided, bits) {
  let acc = 0;
  for (let i = 0; i < symbols.length; i++) acc += cabs(c(symbols[i].re - decided[i].re, symbols[i].im - decided[i].im)) ** 2;
  const evm = Math.sqrt(acc / (symbols.length || 1));
  const p1 = bits.length ? bits.reduce((a, b) => a + b, 0) / bits.length : 0.5;
  const entropy = (p1 > 0 && p1 < 1) ? -p1 * Math.log2(p1) - (1 - p1) * Math.log2(1 - p1) : 0;
  const counts = QPSK_POINTS.map(p => symbols.filter(s => cabs(c(s.re - p.re, s.im - p.im)) < 0.6).length);
  return {
    EVM_percent: +(evm * 100).toFixed(3),
    SNR_estime_db: evm > 1e-10 ? +(-20 * Math.log10(evm)).toFixed(2) : 'inf',
    nb_symboles: symbols.length, nb_bits: bits.length,
    entropie_bits: +entropy.toFixed(4), repartition_symboles: counts,
  };
}

/**
 * Convertit une liste de bits (MSB first) en octets (padding zéro).
 * @param {number[]} bits
 * @returns {number[]} octets
 */
export function bitsToBytes(bits) {
  const pad = (8 - bits.length % 8) % 8;
  const b = pad ? [...bits, ...new Array(pad).fill(0)] : bits;
  const out = [];
  for (let k = 0; k + 8 <= b.length; k += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | b[k + j];
    out.push(v);
  }
  return out;
}
export const bytesToHex = (d, limit = 512) => d.slice(0, limit).map(b => b.toString(16).padStart(2, '0')).join(' ');
export const bytesToAscii = (d, limit = 512) => d.slice(0, limit).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');

/**
 * Cherche le préambule 0101... dans les bits et retourne la position après le préambule.
 * @param {number[]} bits
 * @param {string} [preamble] préambule binaire (32 bits par défaut)
 * @returns {number} position de départ (0 si non trouvé)
 */
export function findSync(bits, preamble = '0101010101010101010101010101010101') {
  const pre = [...preamble].map(Number);
  outer: for (let i = 0; i + pre.length <= bits.length; i++) {
    for (let j = 0; j < pre.length; j++) if (bits[i + j] !== pre[j]) continue outer;
    return i + pre.length;
  }
  return 0;
}

// ---------- décodage texte multi-essais ----------
/**
 * Essaie toutes les combinaisons (mapping x rotation x shift x 7/8 bits) et retourne le meilleur texte printable trouvé (bonus si le marqueur est en tête).
 * @param {number[]} indices indices de symboles décidés (0..3)
 * @param {string} [marker=//] marqueur recherché dans les bits
 * @returns {{score:number, texte:string, hex:string, mapping:string, rotation:number, shift:number, nbits:number, markerPos:number}}
 */
export function decodeBestText(indices, marker = '//') {
  const markerBits = [];
  for (const ch of marker) for (let k = 7; k >= 0; k--) markerBits.push((ch.charCodeAt(0) >> k) & 1);
  let best = { score: 0, texte: '', hex: '', mapping: '', rotation: 0, shift: 0, nbits: 8, markerPos: -1 };
  for (const [mapName, mapping] of Object.entries(MAPPINGS)) {
    for (let rot = 0; rot < 4; rot++) {
      const bits = [];
      for (const i of indices) bits.push(...mapping[(i + rot) % 4]);
      let markerPos = -1;
      if (markerBits.length <= bits.length) {
        outer: for (let pos = 0; pos + markerBits.length <= bits.length; pos++) {
          for (let j = 0; j < markerBits.length; j++) if (bits[pos + j] !== markerBits[j]) continue outer;
          markerPos = pos; break;
        }
      }
      for (let shift = 0; shift < 8; shift++) {
        for (const nbits of [8, 7]) {
          const start = markerPos >= 0 ? markerPos : shift;
          let b = bits.slice(start);
          const pad = (nbits - b.length % nbits) % nbits;
          if (pad) b = [...b, ...new Array(pad).fill(0)];
          const data = [];
          for (let k = 0; k + nbits <= b.length; k += nbits) {
            let v = 0;
            for (let j = 0; j < nbits; j++) v = (v << 1) | b[k + j];
            data.push(v);
          }
          const txt = data.map(x => (x >= 32 && x < 127) ? String.fromCharCode(x) : '.').join('');
          let score = data.filter(x => x >= 32 && x < 127).length / Math.max(data.length, 1);
          if (markerPos >= 0 && txt.startsWith(marker)) score += 0.5;
          if (score > best.score) {
            best = { score: +Math.min(score, 1).toFixed(3), texte: txt, hex: bytesToHex(data, 300), mapping: mapName, rotation: rot, shift, nbits, markerPos };
          }
        }
      }
    }
  }
  return best;
}

// ---------- recomposition ----------
/**
 * Recompose le signal QPSK à partir des symboles décidés (sur-échantillonnage + interpolation, RRC optionnel).
 * @param {Array} decided symboles décidés
 * @param {number} spsFloat SPS (peut être fractionnaire)
 * @param {number} fs fréquence d'échantillonnage (Hz)
 * @param {number} [offset=0]
 * @param {number|null} [rrcBeta=null] roll-off RRC optionnel
 * @returns {Array<{re:number, im:number}>} signal recomposé normalisé
 */
export function recomposeQpsk(decided, spsFloat, fs, offset = 0, rrcBeta = null) {
  const nSym = decided.length;
  const n = Math.floor(offset + (nSym - 1) * spsFloat) + 1;
  const sig = new Array(n).fill(null).map(() => c(0, 0));
  for (let k = 0; k < nSym; k++) {
    const pos = offset + k * spsFloat;
    const i0 = Math.floor(pos), fr = pos - i0, i1 = Math.min(i0 + 1, n - 1);
    sig[i0] = cadd(sig[i0], c(decided[k].re * (1 - fr), decided[k].im * (1 - fr)));
    if (i1 !== i0) sig[i1] = cadd(sig[i1], c(decided[k].re * fr, decided[k].im * fr));
  }
  let p = 0;
  for (const s of sig) p += cabs(s) ** 2;
  p = Math.sqrt(p / n);
  let out = p > 0 ? sig.map(s => c(s.re / p, s.im / p)) : sig;
  if (rrcBeta > 0) out = convolveSameComplex(out, rrcTaps(Math.max(2, Math.round(spsFloat)), rrcBeta));
  return out;
}

/**
 * Sauvegarde le signal recomposé dans un WAV stéréo 16 bits I/Q.
 * @param {Array} decided symboles décidés
 * @param {number} spsFloat
 * @param {number} fs
 * @param {string} file chemin de sortie
 * @param {number} [offset=0]
 * @returns {string} chemin écrit
 */
export function saveRecomposedWav(decided, spsFloat, fs, file, offset = 0) {
  const sig = recomposeQpsk(decided, spsFloat, fs, offset);
  let peak = 0;
  for (const s of sig) peak = Math.max(peak, cabs(s));
  const re = new Float64Array(sig.length), im = new Float64Array(sig.length);
  for (let i = 0; i < sig.length; i++) {
    const sc = peak > 0 ? 0.9 / peak : 1;
    re[i] = sig[i].re * sc * 32767;
    im[i] = sig[i].im * sc * 32767;
  }
  writeWav16(file, fs, [re, im]);
  return file;
}

// ---------- split/merge I-Q (BPSK par voie) ----------
/**
 * Décode une voie réelle (I ou Q seule) en BPSK en testant plusieurs SPS autour de fs/baud ; garde le meilleur (marqueur trouvé le plus tôt).
 * @param {Float64Array|number[]} voie échantillons réels
 * @param {number} fs fréquence d'échantillonnage (Hz)
 * @param {number} baud débit symbole (Baud)
 * @param {string|null} [marker=null] marqueur ASCII attendu
 * @param {number} [tol=3] distance de Hamming max pour le marqueur
 * @returns {{bits:number[], texte:string, hex:string, octets:number[], markerPos:number, markerDist:number, sps:number, nbBits:number}}
 */
export function decodeBpskVoie(voie, fs, baud, marker = null, tol = 3) {
  const mean = voie.reduce((a, b) => a + b, 0) / voie.length;
  const v0 = voie.map(v => v - mean);
  const spsBase = Math.max(2, Math.round(fs / baud));
  const mb = marker ? [...marker].flatMap(ch => [...Array(8)].map((_, k) => (ch.charCodeAt(0) >> (7 - k)) & 1)) : null;
  let best = null;
  for (let d = -6; d <= 6; d++) {
    const sps = spsBase + d;
    if (sps < 2) continue;
    let p = 0;
    for (const v of v0) p += v * v;
    p = Math.sqrt(p / v0.length) || 1;
    const bits = [];
    for (let i = 0; i < v0.length; i += sps) bits.push(v0[i] / p > 0 ? 1 : 0);
    if (bits.length < 10) continue;
    if (mb) {
      let mdist = 999, mpos = -1;
      for (let k = 0; k + mb.length <= bits.length; k++) {
        let dd = 0;
        for (let j = 0; j < mb.length; j++) if (bits[k + j] !== mb[j]) dd++;
        if (dd < mdist) { mdist = dd; mpos = k; }
      }
      if (mdist > tol) continue;
      if (!best || mdist < best.mdist || (mdist === best.mdist && mpos < best.mpos)) best = { mdist, mpos, bits, sps };
    } else if (!best) best = { mdist: -1, mpos: -1, bits, sps };
  }
  if (!best) {
    const bits = [];
    for (let i = 0; i < v0.length; i += spsBase) bits.push(v0[i] > 0 ? 1 : 0);
    best = { mdist: -1, mpos: -1, bits, sps: spsBase };
  }
  const start = best.mpos >= 0 ? best.mpos : 0;
  const octets = bitsToBytes(best.bits.slice(start));
  const txt = octets.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
  return { bits: best.bits, texte: txt, hex: bytesToHex(octets), octets, markerPos: best.mpos, markerDist: best.mdist, sps: best.sps, nbBits: best.bits.length };
}

const bitsOf = data => [...data].flatMap(b => [...Array(8)].map((_, k) => (b >> (7 - k)) & 1));

/**
 * Reconstitue le train binaire final depuis les deux voies BPSK (entrelacement I=bit fort, Q=bit faible), en testant les décalages relatifs de -16 à +16 bits.
 * @param {Buffer} chaineI octets de la voie I
 * @param {Buffer} chaineQ octets de la voie Q
 * @param {boolean} [searchShift=true]
 * @returns {{train: Buffer, shift: number, score: number}}
 */
export function mergeIqTrain(chaineI, chaineQ, searchShift = true) {
  const bi = bitsOf(chaineI), bq = bitsOf(chaineQ);
  const target = [0x2F, 0x2D, 0x2D, 0x2D];
  const interleave = (bi, bq, shift) => {
    const bq2 = shift >= 0 ? bq.slice(shift) : [...new Array(-shift).fill(0), ...bq];
    const n = Math.min(bi.length, bq2.length);
    const merged = [];
    for (let k = 0; k < n; k++) { merged.push(bi[k], bq2[k]); }
    return Buffer.from(bitsToBytes(merged));
  };
  const scoreTrain = train => {
    if (!train.subarray(0, 4).equals(Buffer.from(target))) return -1000;
    let s = 0;
    const m = /^\/---(\d+)?---\/([\s\S]*)$/.exec(train.toString('latin1'));
    if (m) {
      const b64 = m[2];
      const clean = Buffer.from([...b64].map(ch => /[0-9A-Za-z+/=]/.test(ch) ? ch : 'A').join(''));
      if (clean.length % 4 === 0) s += 50;
      try {
        const dec = Buffer.from(clean.subarray(0, clean.length - clean.length % 4).toString('latin1'), 'base64');
        const txt = dec.toString('latin1').replace(/[^0-9:\-.]/g, '');
        s += (txt.length ? [...dec.toString('latin1')].filter(ch => /[0-9:-]/.test(ch)).length / dec.length : 0) * 100;
      } catch { s -= 10; }
    }
    return s;
  };
  if (!searchShift) { const t = interleave(bi, bq, 0); return { train: t, shift: 0, score: scoreTrain(t) }; }
  let best = null;
  for (let shift = -16; shift <= 16; shift++) {
    const t = interleave(bi, bq, shift);
    const sc = scoreTrain(t);
    if (!best || sc > best.score) best = { score: sc, shift, train: t };
  }
  return best;
}

/**
 * Extrait et décode la charge base64 d'un train commençant par /---NNN---/<b64> ; ne garde que les caractères [0-9:.-].
 * @param {Buffer} train train binaire
 * @returns {{text: string|null, nums: number[]}}
 */
export function decodeB64Payload(train) {
  const m = /^\/---(\d+)?---\/([\s\S]*)$/.exec(train.toString('latin1'));
  if (!m) return { text: null, nums: [] };
  const b64 = m[2];
  const clean = [...b64].map(ch => /[0-9A-Za-z+/=]/.test(ch) ? ch : 'A').join('').slice(0, Math.floor(b64.length / 4) * 4);
  try {
    const dec = Buffer.from(clean, 'base64').toString('latin1');
    const s = dec.replace(/[^0-9:.-]/g, '');
    return { text: s, nums: (s.match(/\d+/g) || []).map(Number) };
  } catch { return { text: null, nums: [] }; }
}

/**
 * Écrit un fichier texte avec un groupe de 5 valeurs par ligne, séparées par deux-points (- entre groupes dans le flux original).
 * @param {number[]} nums valeurs (triplets RGB aplatis)
 * @param {string} txtPath chemin de sortie
 * @param {string|null} [rawText=null] texte brut contenant les groupes séparés par -
 * @returns {number} nombre de lignes écrites
 */
export function writePixelsTxt(nums, txtPath, rawText = null) {
  const lines = [];
  if (rawText) {
    for (const g of rawText.split('-')) {
      const vals = g.match(/\d+/g);
      if (vals) lines.push(vals.join(':'));
    }
  } else {
    for (let i = 0; i + 5 <= nums.length; i += 5) lines.push(nums.slice(i, i + 5).join(':'));
  }
  fs.writeFileSync(txtPath, `# ${lines.length} groupes de 5 valeurs\n` + lines.join('\n') + '\n', 'ascii');
  return lines.length;
}

// ---------- API haut niveau (compatible test e2e) ----------
/**
 * Démodulation QPSK haut niveau d'un fichier WAV (API réutilisable, utilisée par le CLI et les tests).
 * @param {string} file chemin du WAV (stéréo I/Q ou mono réel)
 * @param {object} [opts] options
 * @param {number|null} [opts.sps=null] échantillons par symbole (null = auto)
 * @param {number|null} [opts.baud=null] débit symbole (Baud)
 * @param {number|null} [opts.freq=null] porteuse à supprimer (Hz, null = auto)
 * @param {number|null} [opts.offset=null] offset d'échantillonnage (null = auto)
 * @param {boolean} [opts.sync=false] aligner sur le préambule 0101...
 * @param {number} [opts.maxBits=512] nombre max de bits retournés
 * @returns {object} résultat complet (rate, sps, symboles, bits, hex, EVM, SNR, métriques...)
 */
export function demodQpsk(file, { sps = null, baud = null, freq = null, offset = null, sync = false, maxBits = 512 } = {}) {
  const wav = readWav(file);
  const { samples, fs } = toComplex(wav);
  if (baud) sps = sps ?? Math.max(2, Math.round(fs / baud));
  if (!sps) sps = estimateSps(samples, fs);
  const { samples: noDc } = removeDcAndLowfreq(samples, fs, 0);
  const norm = normalize(noDc);
  const { samples: corrected } = freq != null ? removeCarrierFreq(norm, fs, freq) : { samples: norm };
  const off = offset ?? findBestOffset(corrected, sps);
  const symbols = [];
  for (let i = off; i < corrected.length; i += sps) symbols.push(corrected[i]);
  const { samples: aligned, corrDeg } = alignConstellation(symbols);
  const { decided, bits } = qpskDecide(aligned);
  const metrics = computeMetrics(aligned, decided, bits);
  const syncPos = sync ? findSync(bits) : 0;
  const bitsAligned = syncPos ? bits.slice(syncPos) : bits;
  const dataBytes = bitsToBytes(bitsAligned);
  // normalisation amplitude pour EVM (symboles ramenés à module moyen 1)
  let amp = 0;
  for (const s of aligned) amp += cabs(s);
  amp /= aligned.length || 1;
  const normSym = aligned.map(s => c(s.re / amp, s.im / amp));
  const normDec = decided.map(s => c(s.re / amp, s.im / amp));
  const evm = Math.sqrt(normSym.reduce((a, s, i) => a + cabs(c(s.re - normDec[i].re, s.im - normDec[i].im)) ** 2, 0) / (normSym.length || 1));
  return {
    file, rate: fs, sps, offset: off, carrierHz: freq ?? 0, phaseCorrectionDeg: corrDeg,
    numSymbols: aligned.length, evm, snrDb: evm > 1e-10 ? -20 * Math.log10(evm) : 999,
    bits: bitsAligned.slice(0, maxBits).join(''),
    hex: bytesToHex(dataBytes), ascii: bytesToAscii(dataBytes),
    symbols: aligned.map(s => ({ re: +s.re.toFixed(4), im: +s.im.toFixed(4) })),
    metrics,
  };
}

// ---------- CLI ----------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = n => args.find(a => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
  const has = n => args.includes(`--${n}`);
  const file = args.find(a => !a.startsWith('--'));
  if (!file) {
    console.error('Usage : node demod_qpsk.js fichier.wav [--sps=N] [--baud=B] [--scan] [--scan-baud=lo-hi] [--freq=Hz] [--rrc[=beta]] [--bits] [--json] [--sync] [--recompose] [--swap-iq] [--split-iq] [--merge-iq]');
    process.exit(1);
  }
  const wav = readWav(file);
  let { samples } = toComplex(wav);
  const { fs } = toComplex(wav);
  if (has('swap-iq')) samples = samples.map(s => c(s.re, -s.im));
  const baud = opt('baud') ? Number(opt('baud')) : null;

  if (has('split-iq') || has('merge-iq')) {
    const base = file.replace(/\.wav$/i, '');
    const I = [], Q = [];
    for (let i = 0; i < wav.frames; i++) { I.push(wav.data[i * wav.channels] / 2 ** (8 * wav.sampwidth - 1)); if (wav.channels > 1) Q.push(wav.data[i * wav.channels + 1] / 2 ** (8 * wav.sampwidth - 1)); else Q.push(0); }
    const baudVal = baud ?? fs / (opt('sps') ? Number(opt('sps')) : 10);
    const resI = decodeBpskVoie(I, fs, baudVal, opt('marker-i') ?? 'vf');
    const resQ = decodeBpskVoie(Q, fs, baudVal, opt('marker-q') ?? '33');
    fs.writeFileSync(base + '.outi', Buffer.from(resI.octets));
    fs.writeFileSync(base + '.outq', Buffer.from(resQ.octets));
    console.log(JSON.stringify({ splitIq: { I: base + '.outi', Q: base + '.outq', markerI: resI.markerPos, markerQ: resQ.markerPos } }, null, 2));
    if (has('merge-iq')) {
      const { train, shift, score } = mergeIqTrain(fs.readFileSync(base + '.outi'), fs.readFileSync(base + '.outq'));
      fs.writeFileSync(base + '_out.txt', train);
      const { text, nums } = decodeB64Payload(train);
      if (text) writePixelsTxt(nums, base + '_pixels.txt', text);
      console.log(JSON.stringify({ merge: { out: base + '_out.txt', shift, score, taille: train.length } }, null, 2));
    }
    process.exit(0);
  }

  if (has('scan')) {
    const norm = normalize(removeDcAndLowfreq(samples, fs, 0).samples);
    console.log(JSON.stringify({ scan: scanSps(norm, fs) }, null, 2));
    process.exit(0);
  }
  if (opt('scan-baud')) {
    const norm = normalize(removeDcAndLowfreq(samples, fs, 0).samples);
    const spec = opt('scan-baud');
    let bauds = [];
    if (spec.includes('-')) { const [lo, hi] = spec.split('-').map(Number); for (let b = lo; b <= hi; b++) bauds.push(b); }
    else if (spec.includes(',')) { const [ce, st] = spec.split(',').map(Number); for (let k = -10; k <= 10; k++) bauds.push(ce + k * st); }
    else bauds = [Number(spec)];
    const results = bauds.map(b => { const spsF = fs / b; const { offset, evm } = findBestOffsetFrac(norm, spsF, 40); return { baud: b, sps: +spsF.toFixed(4), offset: +offset.toFixed(2), evmPct: +(evm * 100).toFixed(2), snrDb: evm > 1e-10 ? +(-20 * Math.log10(evm)).toFixed(2) : 99 }; })
      .sort((a, b) => a.evmPct - b.evmPct);
    console.log(JSON.stringify({ scanBaud: results }, null, 2));
    process.exit(0);
  }

  const rrcOpt = opt('rrc');
  const rrcBeta = has('rrc') ? (rrcOpt ? Number(rrcOpt) : 0.35) : null;
  const sps = opt('sps') ? Number(opt('sps')) : null;
  const freq = opt('freq') ? Number(opt('freq')) : null;
  const r = demodQpsk(file, { sps, baud, freq, offset: opt('offset') ? Number(opt('offset')) : null, sync: has('sync') });
  if (rrcBeta) r.matchedFilterRrc = rrcBeta;
  if (has('recompose')) {
    const { decided } = qpskDecide(alignConstellation(sampleSymbolsFrac(r.symbols.map(s => c(s.re, s.im)), r.sps, r.offset)).samples);
    const out = file.replace(/\.wav$/i, '') + '_recompose.wav';
    saveRecomposedWav(decided, r.sps, r.rate, out, r.offset);
    r.recompositionWav = out;
  }
  if (has('bits')) r.bitsTotal = r.bits.length;
  const bestText = decodeBestText(qpskDecide(r.symbols.map(s => c(s.re, s.im))).indices, opt('marker') ?? '//');
  r.texteDecode = { score: bestText.score, mapping: bestText.mapping, rotation: bestText.rotation, shift: bestText.shift, nbits: bestText.nbits, texte: bestText.texte.slice(0, 500) };
  console.log(JSON.stringify(r, null, 2));
}
