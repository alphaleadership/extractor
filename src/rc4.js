function toKeyBuffer(key) {
    if (Buffer.isBuffer(key)) return key;
    if (key instanceof Uint8Array) return Buffer.from(key);
    if (typeof key === 'string') return Buffer.from(key, 'latin1');
    throw new Error('Clé invalide : Buffer ou chaîne attendu');
}

export function rc4Keystream(key, length, { drop = 0 } = {}) {
    const k = toKeyBuffer(key);
    if (!k.length) throw new Error('Clé vide');
    const S = new Uint8Array(256);
    for (let i = 0; i < 256; i++) S[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + S[i] + k[i % k.length]) & 0xff;
        [S[i], S[j]] = [S[j], S[i]];
    }
    let i = 0;
    j = 0;
    const sortie = Buffer.alloc(length + drop);
    for (let n = 0; n < sortie.length; n++) {
        i = (i + 1) & 0xff;
        j = (j + S[i]) & 0xff;
        [S[i], S[j]] = [S[j], S[i]];
        sortie[n] = S[(S[i] + S[j]) & 0xff];
    }
    return sortie.subarray(drop);
}

export function rc4(data, key, options) {
    const d = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'latin1');
    const flux = rc4Keystream(key, d.length, options);
    const out = Buffer.alloc(d.length);
    for (let i = 0; i < d.length; i++) {
        out[i] = d[i] ^ flux[i];
    }
    return out;
}
