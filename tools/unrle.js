#!/usr/bin/env node
// unrle.js — décompresse un fichier RLE.
// Usage : node unrle.js <entree.rle> <sortie>
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { rleDecompress } from '../src/rle.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [entree, sortie] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!entree || !sortie) { console.error('Usage : node unrle.js <entree.rle> <sortie>'); process.exit(1); }
  const out = rleDecompress(fs.readFileSync(entree));
  fs.writeFileSync(sortie, out);
  console.log(`${entree} -> ${sortie} (${out.length} octets)`);
}
