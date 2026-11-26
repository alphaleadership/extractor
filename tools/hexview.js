#!/usr/bin/env node
// hexview.js — affiche un dump hexadécimal d'un fichier.
// Usage : node hexview.js <fichier> [--offset=N] [--length=N]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hexDump } from '../src/hexdump.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = n => Number(args.find(a => a.startsWith(`--${n}=`))?.split('=')[1] ?? 0);
  const file = args.find(a => !a.startsWith('--'));
  if (!file) { console.error('Usage : node hexview.js <fichier> [--offset=N] [--length=N]'); process.exit(1); }
  const buf = fs.readFileSync(file);
  console.log(hexDump(buf.subarray(opt('offset'), opt('offset') + (opt('length') || buf.length))));
}
