import crypto from 'node:crypto';

export function pbkdf2Derive(password, salt, { iterations = 100000, keylen = 32, digest = 'sha256' } = {}) {
    return crypto.pbkdf2Sync(password, salt, iterations, keylen, digest);
}

export function scryptDerive(password, { salt = crypto.randomBytes(16), keylen = 32, N = 16384, r = 8, p = 1 } = {}) {
    return crypto.scryptSync(password, salt, keylen, { N, r, p, maxmem: 256 * 1024 * 1024 });
}

export function hkdfDerive(ikm, { salt = Buffer.alloc(0), info = Buffer.alloc(0), length = 32, digest = 'sha256' } = {}) {
    return Buffer.from(crypto.hkdfSync(digest, ikm, salt, info, length));
}

export function hashPassword(password, { salt = crypto.randomBytes(16), N = 16384, r = 8, p = 1 } = {}) {
    const derive = crypto.scryptSync(password, salt, 64, { N, r, p, maxmem: 256 * 1024 * 1024 });
    return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derive.toString('base64')}`;
}

export function verifyPassword(password, stored) {
    const parts = String(stored).split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
        throw new Error('Format de mot de passe attendu : scrypt$N$r$p$salt$hash');
    }
    const [, N, r, p, salt, hash] = parts;
    const attendu = Buffer.from(hash, 'base64');
    const derive = crypto.scryptSync(password, Buffer.from(salt, 'base64'), attendu.length, {
        N: Number(N),
        r: Number(r),
        p: Number(p),
        maxmem: 256 * 1024 * 1024
    });
    return crypto.timingSafeEqual(derive, attendu);
}
