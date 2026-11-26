import fs from 'node:fs';
import crypto from 'node:crypto';

export const ALGORITHMES = ['md5', 'sha1', 'sha256', 'sha512', 'sha3-256', 'sha3-512', 'ripemd160'];

function versBuffer(input) {
    if (Buffer.isBuffer(input)) return input;
    if (input instanceof Uint8Array) return Buffer.from(input);
    return Buffer.from(String(input), 'utf8');
}

export function digest(input, algorithm = 'sha256', encoding = 'hex') {
    return crypto.createHash(algorithm).update(versBuffer(input)).digest(encoding);
}

export function digestFile(filePath, algorithm = 'sha256', encoding = 'hex') {
    const hash = crypto.createHash(algorithm);
    const fd = fs.openSync(filePath, 'r');
    try {
        const buffer = Buffer.alloc(1024 * 1024);
        let lu = fs.readSync(fd, buffer, 0, buffer.length, null);
        while (lu > 0) {
            hash.update(buffer.subarray(0, lu));
            lu = fs.readSync(fd, buffer, 0, buffer.length, null);
        }
    } finally {
        fs.closeSync(fd);
    }
    return hash.digest(encoding);
}

export function hmacDigest(input, key, algorithm = 'sha256', encoding = 'hex') {
    return crypto.createHmac(algorithm, versBuffer(key)).update(versBuffer(input)).digest(encoding);
}

export function fileDigests(filePath, algorithms = ['md5', 'sha1', 'sha256', 'sha512']) {
    const resultats = {};
    for (const algorithm of algorithms) {
        resultats[algorithm] = digestFile(filePath, algorithm);
    }
    return resultats;
}
