import fs from 'node:fs';
import path from 'node:path';

export function readListFile(listPath) {
    return fs.readFileSync(listPath, 'utf8')
        .split('\n')
        .map((ligne) => ligne.split('\r').join('').trim())
        .filter((ligne) => ligne !== '');
}

export function concatFiles(filePaths, outputPath, { append = false } = {}) {
    if (!append && fs.existsSync(outputPath)) {
        fs.rmSync(outputPath);
    }
    for (const filePath of filePaths) {
        fs.appendFileSync(outputPath, fs.readFileSync(filePath));
    }
    return fs.readFileSync(outputPath);
}

export function mergeParts(listPath, outputFile, { partPrefix = '', append = false } = {}) {
    const baseDir = path.dirname(path.resolve(listPath));
    const entries = readListFile(listPath);
    const paths = entries.map((entry) => {
        const candidate = partPrefix + entry;
        return path.isAbsolute(candidate) ? candidate : path.join(baseDir, candidate);
    });
    return concatFiles(paths, outputFile, { append });
}
