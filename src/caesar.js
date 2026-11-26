import { scoreEnglish, indexOfCoincidence } from './entropy.js';

function deplacerLettre(lettre, shift) {
    const code = lettre.charCodeAt(0);
    const base = code >= 97 ? 97 : 65;
    if (code < 65 || (code > 90 && code < 97) || code > 122) return lettre;
    return String.fromCharCode(((code - base + shift) % 26 + 26) % 26 + base);
}

export function caesarShift(texte, shift) {
    return String(texte)
        .split('')
        .map((lettre) => deplacerLettre(lettre, shift))
        .join('');
}

export function rot13(texte) {
    return caesarShift(texte, 13);
}

export function caesarBruteforce(texte, { top = 5 } = {}) {
    const resultats = [];
    for (let shift = 0; shift < 26; shift++) {
        const sortie = caesarShift(texte, -shift); // shift = décalage appliqué au chiffrement
        resultats.push({ shift, text: sortie, score: scoreEnglish(sortie) });
    }
    resultats.sort((a, b) => b.score - a.score);
    return resultats.slice(0, top);
}

function normaliserCle(key) {
    return String(key).toLowerCase().replace(/[^a-z]/g, '');
}

export function vigenereEncrypt(texte, key) {
    const cle = normaliserCle(key);
    if (!cle.length) throw new Error('Clé vide');
    let decalage = 0;
    return String(texte)
        .split('')
        .map((lettre) => {
            if (lettre.toLowerCase() < 'a' || lettre.toLowerCase() > 'z') return lettre;
            const decalageLettre = cle[decalage % cle.length].charCodeAt(0) - 97;
            decalage++;
            return deplacerLettre(lettre, decalageLettre);
        })
        .join('');
}

export function vigenereDecrypt(texte, key) {
    const cle = normaliserCle(key);
    if (!cle.length) throw new Error('Clé vide');
    let decalage = 0;
    return String(texte)
        .split('')
        .map((lettre) => {
            if (lettre.toLowerCase() < 'a' || lettre.toLowerCase() > 'z') return lettre;
            const decalageLettre = cle[decalage % cle.length].charCodeAt(0) - 97;
            decalage++;
            return deplacerLettre(lettre, -decalageLettre);
        })
        .join('');
}

export function guessKeyLength(texte, { min = 1, max = 20 } = {}) {
    const resultats = [];
    const lettres = String(texte).toLowerCase().replace(/[^a-z]/g, '');
    for (let longueur = min; longueur <= max; longueur++) {
        let total = 0;
        let colonnes = 0;
        for (let decalage = 0; decalage < longueur; decalage++) {
            let colonne = '';
            for (let i = decalage; i < lettres.length; i += longueur) {
                colonne += lettres[i];
            }
            if (colonne.length >= 2) {
                total += indexOfCoincidence(colonne);
                colonnes++;
            }
        }
        const ioc = colonnes ? total / colonnes : 0;
        resultats.push({ length: longueur, ioc, distance: Math.abs(ioc - 0.0667) });
    }
    resultats.sort((a, b) => a.distance - b.distance);
    return resultats;
}

export function vigenereBruteforce(texte, { keyLength } = {}) {
    const longueur = keyLength ?? guessKeyLength(texte)[0].length;
    const brut = String(texte);
    const indices = [];
    for (let i = 0; i < brut.length; i++) {
        if (/[a-zA-Z]/.test(brut[i])) indices.push(i);
    }

    let cle = '';
    for (let position = 0; position < longueur; position++) {
        let meilleur = { shift: 0, score: -1 };
        const colonne = indices
            .filter((_, n) => n % longueur === position)
            .map((i) => brut[i])
            .join('');
        for (let shift = 0; shift < 26; shift++) {
            const tentative = caesarShift(colonne, -shift); // déchiffre la colonne
            const score = scoreEnglish(tentative);
            if (score > meilleur.score) meilleur = { shift, score };
        }
        cle += String.fromCharCode(97 + meilleur.shift);
    }

    const text = vigenereDecrypt(brut, cle);
    return [{ key: cle, text, score: scoreEnglish(text) }];
}
