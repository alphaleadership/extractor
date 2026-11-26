import fs from 'node:fs';
import path from 'node:path';

export function copyFolder(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyFolder(srcPath, destPath);
        } else {
            fs.writeFileSync(destPath, fs.readFileSync(srcPath));
        }
    }
}

export function getFolderSnapshot(dir) {
    const snapshot = {};
    const walk = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else {
                const stat = fs.statSync(fullPath);
                snapshot[fullPath] = stat.mtimeMs + '_' + stat.size;
            }
        }
    };
    walk(dir);
    return snapshot;
}

export function snapshotsEqual(a, b) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => a[k] === b[k]);
}

export function startSync({ src, dest, intervalMs = 2000, onSync, onError } = {}) {
    let lastSnapshot = null;

    const checkAndSync = () => {
        try {
            const current = getFolderSnapshot(src);
            const changed = lastSnapshot === null || !snapshotsEqual(lastSnapshot, current);
            if (changed) {
                copyFolder(src, dest);
                lastSnapshot = current;
                if (onSync) onSync({ src, dest, files: Object.keys(current).length });
            }
        } catch (err) {
            if (onError) onError(err);
            else throw err;
        }
    };

    checkAndSync();
    const timer = setInterval(checkAndSync, intervalMs);
    return {
        stop: () => clearInterval(timer),
        check: checkAndSync
    };
}
