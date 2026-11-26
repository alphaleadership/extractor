import crypto from 'node:crypto';

const TAILLE_BLOC = 16;

export function pkcs7Pad(data, blockSize = TAILLE_BLOC) {
    const octet = blockSize - (data.length % blockSize);
    return Buffer.concat([data, Buffer.alloc(octet, octet)]);
}

export function pkcs7Unpad(data, blockSize = TAILLE_BLOC) {
    if (!data.length || data.length % blockSize !== 0) {
        throw new Error('Données invalides pour un dépadding PKCS7');
    }
    const octet = data[data.length - 1];
    if (octet < 1 || octet > blockSize) {
        throw new Error('Octet de padding PKCS7 invalide');
    }
    for (let i = data.length - octet; i < data.length; i++) {
        if (data[i] !== octet) throw new Error('Padding PKCS7 corrompu');
    }
    return data.subarray(0, data.length - octet);
}

export function aesEncrypt(data, { key, iv, algo = 'aes-256-cbc', padding = true } = {}) {
    if (!key) throw new Error('Clé manquante');
    const sansIv = algo.endsWith('-ecb');
    if (!sansIv && !iv) throw new Error('IV manquant');
    const cipher = crypto.createCipheriv(
        algo,
        key,
        sansIv ? null : iv,
        sansIv ? undefined : { authTagLength: algo.endsWith('-gcm') ? 16 : undefined }
    );
    cipher.setAutoPadding(padding);
    const resultat = Buffer.concat([cipher.update(data), cipher.final()]);
    if (algo.endsWith('-gcm')) {
        return Buffer.concat([resultat, cipher.getAuthTag()]);
    }
    return resultat;
}

export function aesDecrypt(data, { key, iv, algo = 'aes-256-cbc', padding = true } = {}) {
    if (!key) throw new Error('Clé manquante');
    const sansIv = algo.endsWith('-ecb');
    if (!sansIv && !iv) throw new Error('IV manquant');

    if (algo.endsWith('-gcm')) {
        const tag = data.subarray(data.length - 16);
        const corps = data.subarray(0, data.length - 16);
        const decipher = crypto.createDecipheriv(algo, key, iv, { authTagLength: 16 });
        decipher.setAuthTag(tag);
        decipher.setAutoPadding(padding);
        return Buffer.concat([decipher.update(corps), decipher.final()]);
    }

    const decipher = crypto.createDecipheriv(algo, key, sansIv ? null : iv);
    decipher.setAutoPadding(padding);
    return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function evpBytesToKey(password, salt, keyLength = 32, ivLength = 16, { digest = 'md5' } = {}) {
    const m = [];
    let material = Buffer.alloc(0);
    let bloc = Buffer.alloc(0);
    while (material.length < keyLength + ivLength) {
        const hash = crypto.createHash(digest);
        hash.update(bloc);
        hash.update(typeof password === 'string' ? Buffer.from(password, 'latin1') : password);
        if (salt) hash.update(salt);
        bloc = hash.digest();
        material = Buffer.concat([material, bloc]);
        m.push(bloc);
    }
    return {
        key: material.subarray(0, keyLength),
        iv: material.subarray(keyLength, keyLength + ivLength)
    };
}

export function parseOpenSslFormat(buffer) {
    if (buffer.length < 16 || buffer.subarray(0, 8).toString('latin1') !== 'Salted__') {
        throw new Error('Format OpenSSL "Salted__" attendu');
    }
    return {
        salt: buffer.subarray(8, 16),
        ciphertext: buffer.subarray(16)
    };
}

export function opensslSaltedEncrypt(data, password, { algo = 'aes-256-cbc', salt = crypto.randomBytes(8), digest = 'md5' } = {}) {
    const { key, iv } = evpBytesToKey(password, salt, 32, 16, { digest });
    const chiffre = aesEncrypt(data, { key, iv, algo });
    return Buffer.concat([Buffer.from('Salted__', 'latin1'), salt, chiffre]);
}

export function opensslSaltedDecrypt(buffer, password, { algo = 'aes-256-cbc', digest = 'md5' } = {}) {
    const { salt, ciphertext } = parseOpenSslFormat(buffer);
    const { key, iv } = evpBytesToKey(password, salt, 32, 16, { digest });
    return aesDecrypt(ciphertext, { key, iv, algo });
}
