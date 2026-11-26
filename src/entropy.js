export const FREQUENCIES_ENGLISH = {
    a: 8.2, b: 1.5, c: 2.8, d: 4.3, e: 12.7, f: 2.2, g: 2.0, h: 6.1,
    i: 7.0, j: 0.15, k: 0.8, l: 4.0, m: 2.4, n: 6.7, o: 7.5, p: 1.9,
    q: 0.10, r: 6.0, s: 6.3, t: 9.1, u: 2.8, v: 1.0, w: 2.4, x: 0.15,
    y: 2.0, z: 0.07
};

export function byteFrequencies(buffer) {
    const freq = new Uint32Array(256);
    for (const octet of buffer) freq[octet]++;
    return freq;
}

export function shannonEntropy(buffer) {
    if (!buffer.length) return 0;
    const freq = byteFrequencies(buffer);
    let entropie = 0;
    for (const compte of freq) {
        if (!compte) continue;
        const p = compte / buffer.length;
        entropie -= p * Math.log2(p);
    }
    return entropie;
}

export function chiSquared(buffer) {
    if (!buffer.length) return 0;
    const freq = byteFrequencies(buffer);
    const attendu = buffer.length / 256;
    let chi = 0;
    for (const compte of freq) {
        const ecart = compte - attendu;
        chi += (ecart * ecart) / attendu;
    }
    return chi;
}

export function indexOfCoincidence(texte) {
    const lettres = String(texte).toLowerCase().replace(/[^a-z]/g, '');
    const n = lettres.length;
    if (n < 2) return 0;
    const freq = new Uint32Array(26);
    for (const lettre of lettres) freq[lettre.charCodeAt(0) - 97]++;
    let total = 0;
    for (const compte of freq) total += compte * (compte - 1);
    return total / (n * (n - 1));
}

export function letterFrequencies(texte) {
    const lettres = String(texte).toLowerCase().replace(/[^a-z]/g, '');
    const freq = new Uint32Array(26);
    for (const lettre of lettres) freq[lettre.charCodeAt(0) - 97]++;
    const result = {};
    if (!lettres.length) return result;
    for (let i = 0; i < 26; i++) {
        result[String.fromCharCode(97 + i)] = freq[i] / lettres.length;
    }
    return result;
}

export function scoreEnglish(texte) {
    const observees = letterFrequencies(texte);
    const lettres = Object.keys(observees);
    if (lettres.length < 2) return 0;

    const x = lettres.map((l) => observees[l] * 100);
    const y = lettres.map((l) => FREQUENCIES_ENGLISH[l]);
    const n = x.length;
    const moyX = x.reduce((a, b) => a + b, 0) / n;
    const moyY = y.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let denX = 0;
    let denY = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - moyX;
        const dy = y[i] - moyY;
        num += dx * dy;
        denX += dx * dx;
        denY += dy * dy;
    }
    if (denX === 0 || denY === 0) return 0;
    return Math.max(0, num / Math.sqrt(denX * denY));
}
