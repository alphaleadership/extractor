import crypto from 'node:crypto';

export function generateRsaKeyPair(modulusLength = 2048) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    return { publicKey, privateKey };
}

function normaliserCle(cle, publique) {
    if (cle && typeof cle === 'object' && cle.type) return cle;
    return crypto.createPublicKey
        ? publique
            ? crypto.createPublicKey(cle)
            : crypto.createPrivateKey(cle)
        : cle;
}

export function importPublicKey(pem) {
    return crypto.createPublicKey(pem);
}

export function importPrivateKey(pem) {
    return crypto.createPrivateKey(pem);
}

export function exportPublicKey(key) {
    return normaliserCle(key, true).export({ type: 'spki', format: 'pem' });
}

export function exportPrivateKey(key) {
    return normaliserCle(key, false).export({ type: 'pkcs8', format: 'pem' });
}

export function publicKeyFromPrivate(privateKey) {
    return crypto.createPublicKey(normaliserCle(privateKey, false));
}

export function rsaEncrypt(data, publicKey, { oaepHash = 'sha256' } = {}) {
    const cle = normaliserCle(publicKey, true);
    return crypto.publicEncrypt(
        { key: cle, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash },
        Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8')
    );
}

export function rsaDecrypt(cipher, privateKey, { oaepHash = 'sha256' } = {}) {
    const cle = normaliserCle(privateKey, false);
    return crypto.privateDecrypt(
        { key: cle, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash },
        cipher
    );
}

export function rsaSign(data, privateKey, { algorithm = 'sha256' } = {}) {
    const cle = normaliserCle(privateKey, false);
    return crypto.sign(algorithm, Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8'), cle);
}

export function rsaVerify(data, signature, publicKey, { algorithm = 'sha256' } = {}) {
    const cle = normaliserCle(publicKey, true);
    return crypto.verify(
        algorithm,
        Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8'),
        cle,
        signature
    );
}
