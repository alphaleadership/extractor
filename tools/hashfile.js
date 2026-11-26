#!/usr/bin/env node
// hashfile.js — calcule les empreintes d'un ou plusieurs fichiers.
// Usage : node hashfile.js [--algo=sha256,md5,...] <fichier> [...]
import { fileDigests, ALGORITHMES } from '../src/hash.js';
import { pathToFileURL } from 'node:url';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const algoOpt = args.find(a => a.startsWith('--algo='))?.split('=')[1];
  const algos = algoOpt ? algoOpt.split(',') : ['sha256'];
  for (const a of algos) if (!ALGORITHMES.includes(a)) { console.error(`algo inconnu: ${a} (${ALGORITHMES.join(', ')})`); process.exit(1); }
  const files = args.filter(a => !a.startsWith('--'));
  if (!files.length) { console.error('Usage : node hashfile.js [--algo=sha256,md5] <fichier> [...]'); process.exit(1); }
  (async () => {
    for (const f of files) {
      const d = await fileDigests(f, algos);
      for (const [algo, hex] of Object.entries(d)) console.log(`${hex}  ${algo}  ${f}`);
    }
  })();
}
