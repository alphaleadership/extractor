#!/usr/bin/env node
// raies_vitesse.js — Extrait les valeurs des raies d'un signal WAV.
// Usage : node raies_vitesse.js <fichier.wav|dossier> [...] [--seuil=-25] [--min-sep=30]
import fs from 'node:fs';
import path from 'node:path';
import { readWav, toMono, rfftMag, fillRfft } from './dsp.js';

function analyze(file, seuilDb, minSepHz, maxPeaks = 25) {
  const wav = readWav(file);
  const rate = wav.rate;
  const data = toMono(wav);
  const n = data.length;
  const spec = fillRfft(rfftMag(data, n), rate);

  let maxI = 0;
  for (let i = 0; i < spec.mag.length; i++) if (spec.mag[i] > spec.mag[maxI]) maxI = i;
  const maxMag = spec.mag[maxI];
  let centroid = 0, sum = 0;
  const specDb = new Float64Array(spec.mag.length);
  for (let i = 0; i < spec.mag.length; i++) {
    specDb[i] = 20 * Math.log10(spec.mag[i] / maxMag + 1e-12);
    centroid += spec.freqs[i] * spec.mag[i];
    sum += spec.mag[i];
  }
  centroid /= sum;
  const half = maxMag / Math.SQRT2;
  let bMin = Infinity, bMax = -Infinity;
  for (let i = 0; i < spec.mag.length; i++) {
    if (spec.mag[i] >= half) { if (spec.freqs[i] < bMin) bMin = spec.freqs[i]; if (spec.freqs[i] > bMax) bMax = spec.freqs[i]; }
  }

  // raies dominantes
  const order = [...Array(spec.mag.length).keys()].sort((a, b) => spec.mag[b] - spec.mag[a]);
  const kept = [];
  for (const i of order) {
    if (specDb[i] < seuilDb) break;
    if (kept.every(k => Math.abs(spec.freqs[i] - k.f) > minSepHz)) kept.push({ f: spec.freqs[i], db: specDb[i] });
    if (kept.length >= maxPeaks) break;
  }
  kept.sort((a, b) => a.f - b.f);

  console.log(`${path.basename(file)}  rate=${rate} Hz  duree=${(n / rate).toFixed(3)} s`);
  console.log(`  pic max       : ${spec.freqs[maxI].toFixed(2)} Hz`);
  console.log(`  centroide     : ${centroid.toFixed(2)} Hz`);
  console.log(`  bande -3 dB   : ${bMin.toFixed(0)} .. ${bMax.toFixed(0)} Hz (BW=${(bMax - bMin).toFixed(0)} Hz)`);
  console.log(`  raies > ${seuilDb} dB (min ${minSepHz} Hz apart):`);
  for (const k of kept) console.log(`    ${k.f.toFixed(2).padStart(10)} Hz  ${k.db.toFixed(1).padStart(6)} dB`);
  console.log();
}

function main() {
  const args = process.argv.slice(2);
  const seuilDb = Number(args.find(a => a.startsWith('--seuil='))?.split('=')[1] ?? -25);
  const minSepHz = Number(args.find(a => a.startsWith('--min-sep='))?.split('=')[1] ?? 30);
  const paths = args.filter(a => !a.startsWith('--'));
  const files = [];
  for (const p of paths) {
    if (fs.statSync(p).isDirectory()) files.push(...fs.readdirSync(p).filter(f => f.endsWith('.wav')).map(f => path.join(p, f)));
    else files.push(p);
  }
  if (!files.length) { console.error('aucun fichier .wav trouvé'); process.exit(1); }
  for (const f of files) analyze(f, seuilDb, minSepHz);
}
main();
