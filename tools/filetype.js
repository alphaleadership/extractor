#!/usr/bin/env node
// filetype.js — détecte le type réel d'un fichier par ses octets magiques.
// Usage : node filetype.js <fichier> [...]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { FORMATS_MAGIQUES, extensionPourFormat } from '../src/magicbytes.js';

/**
 * Détecte le format d'un buffer par ses octets magiques.
 * @param {Buffer} buf début du fichier
 * @returns {{format: string, extension: string} | null}
 */
export function detectFormat(buf) {
  for (const [format, def] of Object.entries(FORMATS_MAGIQUES)) {
    const header = Buffer.from(def.header ?? def.magic ?? []);
    if (header.length && buf.subarray(0, header.length).equals(header)) {
      return { format, extension: def.extension ?? extensionPourFormat(format) };
    }
  }
  // fallback : signatures textuelles
  const head = buf.subarray(0, 512).toString('latin1');
  if (head.startsWith('RIFF') && head.includes('WAVE')) return { format: 'wav', extension: 'wav' };
  if (head.startsWith('<?xml') || head.startsWith('<')) return { format: 'xml/html', extension: 'xml' };
  if (/^\s*[{[]/.test(head)) return { format: 'json', extension: 'json' };
  if (/^#!/.test(head)) return { format: 'script', extension: 'sh' };
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('Usage : node filetype.js <fichier> [...]'); process.exit(1); }
  for (const f of files) {
    const buf = fs.readFileSync(f);
    const r = detectFormat(buf.subarray(0, 64));
    console.log(`${f}: ${r ? `${r.format} (.${r.extension})` : 'inconnu'} (${buf.length} octets)`);
  }
}
