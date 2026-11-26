#!/usr/bin/env node
// carve.js — extrait les fichiers embarqués dans un binaire par leurs signatures.
// Usage : node carve.js <fichier> [--out=dossier]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { FORMATS_MAGIQUES, extensionPourFormat } from '../src/magicbytes.js';
import { findPngEnd } from '../src/png.js';

/**
 * Recherche toutes les occurrences de signatures connues dans un buffer.
 * @param {Buffer} buf données
 * @returns {Array<{format: string, offset: number, end: number, extension: string}>}
 */
export function carveSignatures(buf) {
  const found = [];
  for (const [format, def] of Object.entries(FORMATS_MAGIQUES)) {
    const header = Buffer.from(def.header ?? def.magic ?? []);
    if (!header.length) continue;
    let i = buf.indexOf(header);
    while (i !== -1) {
      let end = -1;
      if (format === 'png' || format === 'PNG') {
        const e = findPngEnd(buf, i);
        if (e > i) end = e;
      }
      found.push({ format, offset: i, end, extension: def.extension ?? extensionPourFormat(format) ?? 'bin' });
      i = buf.indexOf(header, i + 1);
    }
  }
  found.sort((a, b) => a.offset - b.offset);
  return found;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const outDir = args.find(a => a.startsWith('--out='))?.split('=')[1] ?? '.';
  const file = args.find(a => !a.startsWith('--'));
  if (!file) { console.error('Usage : node carve.js <fichier> [--out=dossier]'); process.exit(1); }
  const buf = fs.readFileSync(file);
  const hits = carveSignatures(buf);
  fs.mkdirSync(outDir, { recursive: true });
  for (const h of hits) {
    const end = h.end > h.offset ? h.end : Math.min(h.offset + 4096, buf.length);
    const dest = path.join(outDir, `carve_${h.offset.toString(16)}.${h.extension}`);
    fs.writeFileSync(dest, buf.subarray(h.offset, end));
    console.log(`${h.format} @0x${h.offset.toString(16)} -> ${dest}`);
  }
  if (!hits.length) console.log('aucune signature trouvée');
}
