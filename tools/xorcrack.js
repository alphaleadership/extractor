#!/usr/bin/env node
// xorcrack.js — casse un XOR répété : longueur de clé (IC) puis clé par score anglais.
// Usage : node xorcrack.js <fichier_chiffré> [--max-key=32] [--top=3]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { xorBruteforceKeyLength, xorBruteforceByte, repeatingXor } from '../src/xor.js';

/**
 * Casse un buffer XORé à clé répétée. Retourne les meilleurs candidats.
 * @param {Buffer} data données chiffrées
 * @param {object} [opts] { min, max, top }
 * @returns {{keyLength: number, key: Buffer, text: string, score: number}[]}
 */
export function crackXor(data, { min = 1, max = 32, top = 3 } = {}) {
  const longueurs = xorBruteforceKeyLength(data, { min, max, top: 5 });
  const resultats = [];
  for (const { keyLength } of longueurs.slice(0, top)) {
    const key = Buffer.alloc(keyLength);
    for (let pos = 0; pos < keyLength; pos++) {
      const col = Buffer.from([...data].filter((_, i) => i % keyLength === pos));
      if (!col.length) continue;
      key[pos] = xorBruteforceByte(col, { top: 1 })[0].key;
    }
    const text = repeatingXor(data, key).toString('latin1');
    resultats.push({ keyLength, key, text, score: xorBruteforceByte(repeatingXor(data, key), { top: 1 })[0].score });
  }
  return resultats;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = n => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
  const file = args.find(a => !a.startsWith('--'));
  if (!file) { console.error('Usage : node xorcrack.js <fichier> [--max-key=32] [--top=3]'); process.exit(1); }
  const data = fs.readFileSync(file);
  const res = crackXor(data, { max: Number(opt('max-key') ?? 32), top: Number(opt('top') ?? 3) });
  for (const r of res) {
    console.log(`keyLength=${r.keyLength} key=0x${r.key.toString('hex')} score=${r.score.toFixed(3)}`);
    console.log(`  texte: ${r.text.slice(0, 120)}`);
  }
}
