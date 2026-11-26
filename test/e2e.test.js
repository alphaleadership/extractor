// e2e.test.js — test de bout en bout des outils DSP (tools/).
// Génère des signaux WAV synthétiques, fait tourner les outils CLI/modules
// dessus et vérifie les valeurs extraites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeWav16, readWav, toMono, rfftMag, fillRfft } from '../tools/dsp.js';
import { demodQpsk } from '../tools/demod_qpsk.js';
import { filterWav } from '../tools/filtre_cos_sureleve.js';
import { step1, step2, step3, guessFreq, coarseFreq } from '../tools/td04.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'extractor-e2e-'));

/** Génère un WAV mono : porteuse pure à f0 Hz. */
function makeTone(file, rate, f0, durS) {
  const n = Math.floor(rate * durS);
  const data = new Float64Array(n);
  for (let i = 0; i < n; i++) data[i] = 20000 * Math.cos(2 * Math.PI * f0 * i / rate);
  writeWav16(file, rate, [data]);
  return file;
}

/** Génère un WAV stéréo I/Q modulé QPSK. */
function makeQpsk(file, rate, sps, symbols) {
  const n = symbols.length * sps;
  const re = new Float64Array(n), im = new Float64Array(n);
  symbols.forEach((s, k) => {
    for (let j = 0; j < sps; j++) {
      re[k * sps + j] = 20000 * s.re;
      im[k * sps + j] = 20000 * s.im;
    }
  });
  writeWav16(file, rate, [re, im]);
  return file;
}

test('e2e : raies_vitesse retrouve la porteuse d un WAV synthétique', () => {
  const rate = 1024000, f0 = 100000;
  const file = makeTone(path.join(tmp, 'tone.wav'), rate, f0, 0.1);
  const x = toMono(readWav(file));
  const spec = fillRfft(rfftMag(x, x.length), rate);
  let mi = 0;
  for (let i = 1; i < spec.mag.length; i++) if (spec.mag[i] > spec.mag[mi]) mi = i;
  assert.ok(Math.abs(spec.freqs[mi] - f0) < rate / x.length + 1, `pic à ${spec.freqs[mi]} Hz`);
});

test('e2e : demod_qpsk décode les symboles émis', () => {
  const rate = 1024000, sps = 8;
  const symbols = [
    { re: 1, im: 1 }, { re: -1, im: 1 }, { re: -1, im: -1 }, { re: 1, im: -1 },
    { re: 1, im: 1 }, { re: -1, im: 1 }, { re: -1, im: -1 }, { re: 1, im: -1 },
  ]; // moyenne nulle (le démodulateur supprime la composante DC)
  const file = makeQpsk(path.join(tmp, 'qpsk.wav'), rate, sps, symbols);
  const r = demodQpsk(file, { sps, freq: 0 });
  assert.equal(r.numSymbols, symbols.length);
  // bits attendus : mapping Gray du Python (45°->00, 135°->01, 225°->11, 315°->10)
  const gray = { '1,1': '00', '-1,1': '01', '-1,-1': '11', '1,-1': '10' };
  const expected = symbols.map(s => gray[`${s.re},${s.im}`]).join('');
  assert.equal(r.bits, expected);
  assert.ok(r.evm < 1e-6, `EVM quasi nulle, got ${r.evm}`);
});

test('e2e : filtre_cos_sureleve conserve rate et nombre de trames', () => {
  const rate = 1024000;
  const src = makeTone(path.join(tmp, 'src.wav'), rate, 50000, 0.05);
  const dst = path.join(tmp, 'dst.wav');
  const r = filterWav(src, dst);
  const out = readWav(dst);
  assert.equal(r.rate, rate);
  assert.equal(out.rate, rate);
  assert.equal(out.frames, readWav(src).frames);
  assert.ok(r.fZero > 0);
});

test('e2e : td04 step1 -> step2 -> step3 chaîne cohérente', () => {
  const sps = 8, numTaps = 103, beta = 0.35, numSymbols = 50;
  const { pulse } = step1(numSymbols, sps);
  assert.equal(pulse.length, numSymbols * sps);
  const h = step2(numTaps, beta, sps);
  assert.equal(h.length, numTaps);
  const shaped = step3(numSymbols, sps, numTaps, beta);
  assert.equal(shaped.length, pulse.length + h.length - 1);
});

test('e2e : td04 guess estime la fréquence d une porteuse pure', () => {
  const rate = 1024000, f0 = 100000;
  const file = makeTone(path.join(tmp, 'guess.wav'), rate, f0, 0.05);
  const x = toMono(readWav(file));
  const coarse = coarseFreq(rate, x);
  assert.ok(Math.abs(coarse - f0) < rate / x.length + 1, `coarse ${coarse} Hz`);
  const r = guessFreq(file);
  assert.ok(Math.abs(r.estimeHz - f0) < 200, `estime ${r.estimeHz} Hz`);
});
