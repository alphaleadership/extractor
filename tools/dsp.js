// dsp.js — noyau DSP partagé (lecture/écriture WAV PCM, FFT, filtres).
import fs from 'node:fs';

/** Lit un WAV PCM non compressé. Retourne { rate, channels, sampwidth, frames, data: Float64Array (mix mono ou entrelacé) }. */
/**
 * Lit un WAV PCM non compressé (8/16/24/32 bits, mono ou multicanal). Ignore les octets d'un échantillon incomplet (WAV tronqué).
 * @param {string} path chemin du fichier WAV
 * @returns {{rate: number, channels: number, sampwidth: number, frames: number, data: Float64Array}} données entrelacées normalisées en amplitude brute
 */
export function readWav(path) {
  const buf = fs.readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path}: pas un fichier RIFF/WAVE`);
  }
  let pos = 12;
  let fmt = null;
  let raw = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = buf.subarray(pos + 8, pos + 8 + size);
    if (id === 'fmt ') {
      fmt = {
        audioFormat: body.readUInt16LE(0),
        channels: body.readUInt16LE(2),
        rate: body.readUInt32LE(4),
        sampwidth: body.readUInt16LE(14) / 8,
      };
    } else if (id === 'data') {
      raw = body;
    }
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !raw) throw new Error(`${path}: blocs fmt/data manquants`);
  if (fmt.audioFormat !== 1) throw new Error(`${path}: seul le PCM (format 1) est supporté`);
  // WAV tronqué/corrompu : ignorer les octets d'un échantillon incomplet
  const residu = raw.length % (fmt.sampwidth * fmt.channels);
  if (residu) raw = raw.subarray(0, raw.length - residu);
  const frames = raw.length / (fmt.sampwidth * fmt.channels);
  const data = new Float64Array(frames * fmt.channels);
  for (let i = 0; i < data.length; i++) {
    const o = i * fmt.sampwidth;
    if (fmt.sampwidth === 1) data[i] = raw.readUInt8(o) - 128;
    else if (fmt.sampwidth === 2) data[i] = raw.readInt16LE(o);
    else if (fmt.sampwidth === 3) {
      let v = raw.readIntLE(o, 3);
      if (v & 0x800000) v |= ~0xffffff;
      data[i] = v;
    } else if (fmt.sampwidth === 4) data[i] = raw.readInt32LE(o);
    else throw new Error(`sampwidth ${fmt.sampwidth} non supporté`);
  }
  return { rate: fmt.rate, channels: fmt.channels, sampwidth: fmt.sampwidth, frames, data };
}

/** Écrit un WAV PCM 16 bits. channelsData: tableau de Float64Array (un par canal). */
/**
 * Écrit un WAV PCM 16 bits à partir d'un tableau de canaux.
 * @param {string} path chemin de sortie
 * @param {number} rate fréquence d'échantillonnage (Hz)
 * @param {Float64Array[]} channelsData un Float64Array par canal
 */
export function writeWav16(path, rate, channelsData) {
  const channels = channelsData.length;
  const frames = channelsData[0].length;
  const sampwidth = 2;
  const dataSize = frames * channels * sampwidth;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + dataSize, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * channels * sampwidth, 28);
  buf.writeUInt16LE(channels * sampwidth, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      let v = Math.round(channelsData[c][i]);
      v = Math.max(-32768, Math.min(32767, v));
      buf.writeInt16LE(v, 44 + (i * channels + c) * 2);
    }
  }
  fs.writeFileSync(path, buf);
}

/** FFT complexe radix-2 (longueur = puissance de 2). Entrée/sortie: tableaux de {re, im}. */
/**
 * FFT complexe radix-2 in-place (longueur = puissance de 2).
 * @param {Float64Array} re partie réelle (modifiée in-place)
 * @param {Float64Array} im partie imaginaire (modifiée in-place)
 */
export function fft(re, im) {
  const n = re.length;
  if ((n & (n - 1)) !== 0) throw new Error('fft: longueur doit être une puissance de 2');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wre = Math.cos(ang), wim = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curre = 1, curim = 0;
      for (let k = 0; k < len / 2; k++) {
        const ure = re[i + k], uim = im[i + k];
        const vre = re[i + k + len / 2] * curre - im[i + k + len / 2] * curim;
        const vim = re[i + k + len / 2] * curim + im[i + k + len / 2] * curre;
        re[i + k] = ure + vre; im[i + k] = uim + vim;
        re[i + k + len / 2] = ure - vre; im[i + k + len / 2] = uim - vim;
        const nre = curre * wre - curim * wim;
        curim = curre * wim + curim * wre;
        curre = nre;
      }
    }
  }
}

/** Prochaine puissance de 2 >= n. */
/**
 * Prochaine puissance de 2 supérieure ou égale à n.
 * @param {number} n
 * @returns {number}
 */
export function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

/** Spectre d'amplitude (RFFT) avec fenêtre de Hann. Retourne { freqs, mag } pour une longueur n (complète avec des zéros). */
/**
 * Spectre d'amplitude (RFFT) avec fenêtre de Hann et zero-padding.
 * @param {Float64Array|Array<number>} data signal réel
 * @param {number} n nombre d'échantillons à utiliser
 * @returns {{freqs: Float64Array, mag: Float64Array, re: Float64Array, im: Float64Array, N: number}} (freqs/mag à remplir via fillRfft)
 */
export function rfftMag(data, n) {
  const N = nextPow2(n);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < n; i++) re[i] = data[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  fft(re, im);
  const half = N / 2 + 1;
  const mag = new Float64Array(half);
  const freqs = new Float64Array(half);
  return { freqs, mag, re, im, N };
}

/** Remplit freqs/mag à partir de re/im. */
/**
 * Remplit freqs (Hz) et mag à partir des tableaux re/im de rfftMag.
 * @param {{freqs: Float64Array, mag: Float64Array, re: Float64Array, im: Float64Array, N: number}} out
 * @param {number} rate fréquence d'échantillonnage (Hz)
 * @returns {object} out complété
 */
export function fillRfft(out, rate) {
  const half = out.mag.length;
  for (let i = 0; i < half; i++) {
    out.mag[i] = Math.hypot(out.re[i], out.im[i]);
    out.freqs[i] = i * rate / out.N;
  }
  return out;
}

/** Coefficients d'un filtre en cosinus surélevé (passe-bas), Ts = échantillons/symbole. */
/**
 * Coefficients d'un filtre en cosinus surélevé (passe-bas).
 * @param {number} numTaps nombre de coefficients (impair recommandé)
 * @param {number} beta roll-off (0..1)
 * @param {number} Ts échantillons par symbole
 * @returns {Float64Array}
 */
export function raisedCosineTaps(numTaps, beta, Ts) {
  const h = new Float64Array(numTaps);
  const mid = (numTaps - 1) / 2;
  for (let i = 0; i < numTaps; i++) {
    const t = i - mid;
    const x = t / Ts;
    let sinc;
    if (Math.abs(x) < 1e-12) sinc = 1;
    else sinc = Math.sin(Math.PI * x) / (Math.PI * x);
    const denom = 1 - (2 * beta * x) ** 2;
    const cosTerm = Math.abs(denom) < 1e-12 ? Math.PI / 4 : Math.cos(Math.PI * beta * x) / denom;
    h[i] = sinc * cosTerm;
  }
  return h;
}

/** Convolution 'full'. */
/**
 * Convolution 'full' de deux signaux réels.
 * @param {Float64Array|Array<number>} x signal
 * @param {Float64Array|Array<number>} h noyau
 * @returns {Float64Array} signal de longueur x.length + h.length - 1
 */
export function convolve(x, h) {
  const n = x.length + h.length - 1;
  const out = new Float64Array(n);
  for (let i = 0; i < h.length; i++) {
    const hi = h[i];
    if (hi === 0) continue;
    for (let j = 0; j < x.length; j++) out[i + j] += hi * x[j];
  }
  return out;
}

/** Mélange mono (moyenne des canaux). */
/**
 * Mélange un WAV multicanal en mono (moyenne des canaux).
 * @param {{channels: number, frames: number, data: Float64Array}} wav
 * @returns {Float64Array}
 */
export function toMono(wav) {
  if (wav.channels === 1) return Float64Array.from(wav.data);
  const out = new Float64Array(wav.frames);
  for (let i = 0; i < wav.frames; i++) {
    let s = 0;
    for (let c = 0; c < wav.channels; c++) s += wav.data[i * wav.channels + c];
    out[i] = s / wav.channels;
  }
  return out;
}

/** Sépare un WAV stéréo en I/Q complexe (avec les correctifs de troncature du patch). */
/**
 * Sépare un WAV stéréo entrelacé en signal complexe I/Q (trame = couple I,Q). Tronque à un nombre pair de trames (correctif WAV tronqué).
 * @param {{frames: number, data: Float64Array, rate: number}} wav
 * @returns {{re: Float64Array, im: Float64Array, rate: number}}
 */
export function stereoToIQ(wav) {
  // WAV stéréo entrelacé : chaque trame = un couple (I, Q).
  // On tronque à un nombre PAIR de trames (correctif WAV tronqué).
  const n = wav.frames % 2 === 0 ? wav.frames : wav.frames - 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    re[i] = wav.data[i * 2];
    im[i] = wav.data[i * 2 + 1];
  }
  return { re, im, rate: wav.rate };
}
