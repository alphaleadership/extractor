import fs from 'node:fs';
import { extractPng } from './png.js';

const REGEX_DECOUPE = /([0-9]+b')/g;
const REGEX_NUMERO = /^([0-9]+)/;
const REGEX_PAQUET = /^(\d+)b'([^']+)'$/;

export function countOccurrences(tableau) {
    const occurrences = new Map();
    for (const element of tableau) {
        occurrences.set(element, (occurrences.get(element) || 0) + 1);
    }
    return Array.from(occurrences.entries()).sort((a, b) => a[1] - b[1]);
}

export function formatCountReport(occurrences) {
    return occurrences
        .slice()
        .sort((a, b) => a[0] - b[0])
        .map(([element, compte]) => `item ${element} vu ${compte}`)
        .join('\n');
}

export function splitPacketsText(data) {
    const texteAvecSauts = String(data).replace(REGEX_DECOUPE, '\n$1');
    return texteAvecSauts
        .split('\n')
        .map((ligne) => ligne.trim())
        .filter((ligne) => ligne.length > 0);
}

export function dedupAndSortLines(lignes) {
    const numerosVus = new Set();
    const uniques = lignes.filter((ligne) => {
        const match = ligne.match(REGEX_NUMERO);
        if (!match) return false;
        const numero = match[1];
        if (numerosVus.has(numero)) return false;
        numerosVus.add(numero);
        return true;
    });
    uniques.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    return uniques;
}

export function parsePacketLine(raw) {
    const match = String(raw).match(REGEX_PAQUET);
    if (!match) return null;
    return {
        prefix: Number(match[1]),
        payload: Buffer.from(match[2], 'base64')
    };
}

export function cleanPayloadBuffers(buffers) {
    return buffers.filter((buf) => {
        if (!buf || buf.length < 4) return false;
        if (buf[0] === 0x00) return false;
        return true;
    });
}

export function payloadsByPrefix(paires) {
    const fil = [];
    const prefixes = [];
    for (const paire of paires) {
        const parse = typeof paire === 'string' || paire instanceof String
            ? parsePacketLine(paire)
            : paire;
        if (!parse) continue;
        prefixes.push(parse.prefix);
        fil[parse.prefix] = parse.payload;
    }
    return { fil, prefixes };
}

export function concatPayloads(buffers) {
    return Buffer.concat(cleanPayloadBuffers(buffers).filter(Boolean));
}

export function processPacketText(data, { extraireImage = true } = {}) {
    const lignes = dedupAndSortLines(splitPacketsText(data));
    const paires = lignes
        .map((ligne) => parsePacketLine(ligne))
        .filter(Boolean);
    const { fil, prefixes } = payloadsByPrefix(paires);
    const imageBuffer = concatPayloads(fil);
    return {
        lignes,
        occurrences: countOccurrences(prefixes),
        buffers: fil,
        brut: imageBuffer,
        image: extraireImage ? extractPng(imageBuffer) : imageBuffer
    };
}

export function processPacketFile(inputPath, { lignesPath, comptePath, imagePath } = {}) {
    const resultat = processPacketText(fs.readFileSync(inputPath, 'ascii'));
    if (lignesPath) fs.writeFileSync(lignesPath, resultat.lignes.join('\n'));
    if (comptePath) fs.writeFileSync(comptePath, formatCountReport(resultat.occurrences));
    if (imagePath) fs.writeFileSync(imagePath, resultat.image);
    return resultat;
}
