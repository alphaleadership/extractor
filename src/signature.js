import crypto from 'node:crypto';

export function generateSigningKeyPair(algorithm = 'ed25519', options = {}) {
    if (algorithm === 'ed25519') {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        return { algorithm, publicKey, privateKey };
    }
    if (algorithm === 'ec') {
        const { namedCurve = 'prime256v1' } = options;
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
            namedCurve,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        return { algorithm, namedCurve, publicKey, privateKey };
    }
    if (algorithm === 'rsa') {
        const { modulusLength = 2048 } = options;
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });
        return { algorithm, publicKey, privateKey };
    }
    throw new Error(`Algorithme de signature inconnu : ${algorithm}`);
}

function preparer(algorithm) {
    return algorithm === 'ed25519' ? null : 'sha256';
}

export function signData(data, privateKey, { algorithm = 'ed25519' } = {}) {
    const hash = preparer(algorithm);
    return crypto.sign(
        hash,
        Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8'),
        privateKey
    );
}

export function verifyData(data, signature, publicKey, { algorithm = 'ed25519' } = {}) {
    const hash = preparer(algorithm);
    return crypto.verify(
        hash,
        Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8'),
        publicKey,
        signature
    );
}
