#!/usr/bin/env node
// caesar.js — déchiffre un texte César/Vigenère par analyse de fréquences.
// Usage : node caesar.js <fichier> [--key=secret] [--top=5]
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { caesarBruteforce, vigenereBruteforce, vigenereDecrypt, guessKeyLength } from '../src/caesar.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = n => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
  const file = args.find(a => !a.startsWith('--'));
  if (!file) { console.error('Usage : node caesar.js <fichier> [--key=secret] [--top=5]'); process.exit(1); }
  const texte = fs.readFileSync(file, 'utf8');
  const key = opt('key');
  if (key) {
    console.log(vigenereDecrypt(texte, key));
  } else {
    const top = Number(opt('top') ?? 5);
    console.log('--- César (top ' + top + ') ---');
    for (const r of caesarBruteforce(texte, { top })) console.log(`shift=${r.shift} score=${r.score.toFixed(3)}  ${r.text.slice(0, 80)}`);
    const g = guessKeyLength(texte, { max: 10 })[0];
    console.log(`--- Vigenère (longueur estimée: ${g.length}) ---`);
    for (const r of vigenereBruteforce(texte, { keyLength: g.length })) console.log(`key=${r.key}  ${r.text.slice(0, 80)}`);
  }
}
