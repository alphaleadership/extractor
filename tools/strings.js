#!/usr/bin/env node
// strings.js — extrait les chaînes imprimables d'un fichier binaire.
// Usage : node strings.js <fichier> [--min=4]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Extrait les chaînes ASCII imprimables d'au moins `min` caractères.
 * @param {Buffer} buf données binaires
 * @param {number} [min=4] longueur minimale
 * @returns {string[]} chaînes trouvées (avec leur offset)
 */
export function extractStrings(buf, min = 4) {
  const out = [];
  let cur = '';
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b >= 32 && b < 127) {
      if (!cur.length) start = i;
      cur += String.fromCharCode(b);
    } else {
      if (cur.length >= min) out.push({ offset: start, text: cur });
      cur = '';
    }
  }
  if (cur.length >= min) out.push({ offset: start, text: cur });
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const min = Number(args.find(a => a.startsWith('--min='))?.split('=')[1] ?? 4);
  const file = args.find(a => !a.startsWith('--'));
  if (!file) { console.error('Usage : node strings.js <fichier> [--min=4]'); process.exit(1); }
  for (const s of extractStrings(fs.readFileSync(file), min)) {
    console.log(`0x${s.offset.toString(16).padStart(8, '0')}  ${s.text}`);
  }
}
