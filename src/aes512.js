import fs from 'node:fs';
import { aes } from 'aes512';
import crypto from 'node:crypto';
import { hmacDigest } from './hash.js';

function silencieux(fn) {
    const original = console.log;
    console.log = () => {};
    try {
        return fn();
    } finally {
        console.log = original;
    }
}

export function getkey(longueur = 32) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}';
    const octets = crypto.randomBytes(longueur);
    let cle = '';
    for (let i = 0; i < longueur; i++) {
        cle += alphabet[octets[i] % alphabet.length];
    }
    return cle;
}

export function createCipher(key) {
    if (typeof key !== 'string' || !key) {
        throw new TypeError('La clé doit être une chaîne non vide');
    }
    const interne = new aes.createCipher(key);
    return {
        key,
        encrypt(data) {
            return interne.crypt(data, key);
        },
        decrypt(data) {
            return silencieux(() => interne.decrypt(data, key));
        },
        encryptFile(path, options) {
            return encryptFile(path, key, options);
        },
        decryptFile(path, options) {
            return decryptFile(path, key, options);
        }
    };
}

export function encrypt(data, key) {
    return createCipher(key).encrypt(data);
}

export function decrypt(data, key) {
    return createCipher(key).decrypt(data);
}

function ecrireAtomique(cible, contenu) {
    const temporaire = `${cible}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    fs.writeFileSync(temporaire, contenu);
    fs.renameSync(temporaire, cible);
}

function operationFichier(path, key, { backup = false, outputPath, traitement } = {}) {
    const cible = outputPath ?? path;
    const donnees = fs.readFileSync(path);
    const resultat = traitement(donnees);
    if (backup && cible === path && fs.existsSync(path)) {
        fs.copyFileSync(path, `${path}.bak`);
    }
    ecrireAtomique(cible, resultat);
    return cible;
}

export function encryptFile(path, key, options = {}) {
    return operationFichier(path, key, { ...options, traitement: (donnees) => encrypt(donnees, key) });
}

export function decryptFile(path, key, options = {}) {
    return operationFichier(path, key, { ...options, traitement: (donnees) => decrypt(donnees, key) });
}

export function hash(data, key) {
    return hmacDigest(data, key, 'sha256');
}

export { aes as aes512Module };
