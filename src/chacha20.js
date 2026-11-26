import crypto from 'node:crypto';

const IV_OPENSSL = 16;
const NONCE_AEAD = 12;

function ivChacha20(nonce, counter) {
    if (Buffer.isBuffer(nonce) && nonce.length === IV_OPENSSL) return nonce;
    if (!Buffer.isBuffer(nonce) || nonce.length !== NONCE_AEAD) {
        throw new Error('Nonce de 12 octets attendu (ou IV OpenSSL de 16 octets)');
    }
    const iv = Buffer.alloc(IV_OPENSSL);
    iv.writeUInt32LE(counter >>> 0, 0);
    nonce.copy(iv, 4);
    return iv;
}

export function chacha20Encrypt(data, key, nonce, { counter = 0 } = {}) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Clé de 32 octets attendue');
    const cipher = crypto.createCipheriv('chacha20', key, ivChacha20(nonce, counter));
    return Buffer.concat([cipher.update(data), cipher.final()]);
}

export function chacha20Decrypt(data, key, nonce, options = {}) {
    return chacha20Encrypt(data, key, nonce, options);
}

export function chacha20Seal(data, key, nonce, { aad } = {}) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Clé de 32 octets attendue');
    if (!Buffer.isBuffer(nonce) || nonce.length !== NONCE_AEAD) throw new Error('Nonce de 12 octets attendu');
    const cipher = crypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
    if (aad) cipher.setAAD(aad);
    const chiffre = Buffer.concat([cipher.update(data), cipher.final()]);
    return { ciphertext: chiffre, tag: cipher.getAuthTag() };
}

export function chacha20Open(ciphertext, key, nonce, { tag, aad } = {}) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Clé de 32 octets attendue');
    if (!Buffer.isBuffer(nonce) || nonce.length !== NONCE_AEAD) throw new Error('Nonce de 12 octets attendu');
    if (!Buffer.isBuffer(tag) || tag.length !== 16) throw new Error('Tag d authentification de 16 octets attendu');
    const decipher = crypto.createDecipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    if (aad) decipher.setAAD(aad);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
