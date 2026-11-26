#!/usr/bin/env node
// b64.js — encode/décode en base64 (fichier ou chaîne).
// Usage : node b64.js encode <fichier|texte>   |   node b64.js decode <fichier|texte> [--out=fichier]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { decodeBase64 } from '../src/base64.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, input, ...rest] = process.argv.slice(2);
  const out = rest.find(a => a.startsWith('--out='))?.split('=')[1];
  if (!mode || !input) { console.error('Usage : node b64.js encode|decode <fichier|texte> [--out=fichier]'); process.exit(1); }
  const isFile = fs.existsSync(input) && fs.statSync(input).isFile();
  const data = isFile ? fs.readFileSync(input) : Buffer.from(input, 'utf8');
  if (mode === 'encode') {
    const res = data.toString('base64');
    if (out) fs.writeFileSync(out, res); else console.log(res);
  } else {
    const res = decodeBase64(data.toString('utf8').trim());
    if (out) fs.writeFileSync(out, res); else process.stdout.write(res);
  }
}
