import crypto from 'node:crypto';

export function desEncrypt(data, { key, iv = Buffer.alloc(8), algo = 'des-ede3-cbc', padding = true } = {}) {
    if (!key) throw new Error('Clé manquante');
    if (!Buffer.isBuffer(key)) key = Buffer.from(key, 'latin1');
    const sansIv = algo === 'des-ede3';
    const cipher = crypto.createCipheriv(algo, key, sansIv ? null : iv);
    cipher.setAutoPadding(padding);
    return Buffer.concat([cipher.update(data), cipher.final()]);
}

export function desDecrypt(data, { key, iv = Buffer.alloc(8), algo = 'des-ede3-cbc', padding = true } = {}) {
    if (!key) throw new Error('Clé manquante');
    if (!Buffer.isBuffer(key)) key = Buffer.from(key, 'latin1');
    const sansIv = algo === 'des-ede3';
    const decipher = crypto.createDecipheriv(algo, key, sansIv ? null : iv);
    decipher.setAutoPadding(padding);
    return Buffer.concat([decipher.update(data), decipher.final()]);
}
