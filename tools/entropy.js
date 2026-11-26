#!/usr/bin/env node
// entropy.js — entropie de Shannon, chi² et IC d'un fichier (détection de chiffrement/compression).
// Usage : node entropy.js <fichier>
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { shannonEntropy, chiSquared, indexOfCoincidence } from '../src/entropy.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!file) { console.error('Usage : node entropy.js <fichier>'); process.exit(1); }
  const buf = fs.readFileSync(file);
  console.log(JSON.stringify({
    fichier: file,
    octets: buf.length,
    entropie_shannon: +shannonEntropy(buf).toFixed(4),
    chi2: +chiSquared(buf).toFixed(2),
    index_coincidence: +indexOfCoincidence(buf.toString('latin1')).toFixed(4),
  }, null, 2));
}
