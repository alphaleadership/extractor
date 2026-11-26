import { shannonEntropy, scoreEnglish } from './entropy.js';

function toKeyBuffer(key) {
    if (Buffer.isBuffer(key)) return key;
    if (key instanceof Uint8Array) return Buffer.from(key);
    if (typeof key === 'string') return Buffer.from(key, 'latin1');
    throw new Error('Clé invalide : Buffer ou chaîne attendu');
}

export function repeatingXor(data, key) {
    const d = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'latin1');
    const k = toKeyBuffer(key);
    if (!k.length) throw new Error('Clé vide');
    const out = Buffer.alloc(d.length);
    for (let i = 0; i < d.length; i++) {
        out[i] = d[i] ^ k[i % k.length];
    }
    return out;
}

export function xorBruteforceByte(data, { top = 5 } = {}) {
    const resultats = [];
    for (let cle = 0; cle < 256; cle++) {
        const decoded = Buffer.alloc(data.length);
        for (let i = 0; i < data.length; i++) {
            decoded[i] = data[i] ^ cle;
        }
        resultats.push({
            key: cle,
            decoded,
            score: scoreEnglish(decoded.toString('latin1')),
            entropy: shannonEntropy(decoded)
        });
    }
    resultats.sort((a, b) => b.score - a.score || a.entropy - b.entropy);
    return resultats.slice(0, top);
}

function colonne(data, longueur, decalage) {
    const octets = [];
    for (let i = decalage; i < data.length; i += longueur) {
        octets.push(data[i]);
    }
    return Buffer.from(octets);
}

export function xorBruteforceKeyLength(data, { min = 1, max = 32, top = 5 } = {}) {
    const resultats = [];
    for (let longueur = min; longueur <= Math.max(min, Math.min(max, data.length)); longueur++) {
        let scoreTotal = 0;
        let morceaux = 0;
        for (let decalage = 0; decalage < longueur; decalage++) {
            const col = colonne(data, longueur, decalage);
            if (!col.length) continue;
            scoreTotal += xorBruteforceByte(col, { top: 1 })[0].score;
            morceaux++;
        }
        resultats.push({
            keyLength: longueur,
            score: morceaux ? scoreTotal / morceaux : 0
        });
    }
    resultats.sort((a, b) => b.score - a.score);
    return resultats.slice(0, top);
}

export function recoverKeyFromKnownPlaintext(ciphertext, plaintext, offset = 0) {
    const ct = toKeyBuffer(ciphertext);
    const pt = toKeyBuffer(plaintext);
    if (offset < 0 || offset + pt.length > ct.length) {
        throw new Error('Plaintext hors des limites du ciphertext');
    }
    const key = Buffer.alloc(pt.length);
    for (let i = 0; i < pt.length; i++) {
        key[i] = ct[offset + i] ^ pt[i];
    }
    let periodique = null;
    for (let p = 1; p <= Math.floor(key.length / 2); p++) {
        let ok = true;
        for (let i = 0; i + p < key.length; i++) {
            if (key[i] !== key[i + p]) {
                ok = false;
                break;
            }
        }
        if (ok) {
            periodique = key.subarray(0, p);
            break;
        }
    }
    return { key, repeatedKey: periodique };
}
