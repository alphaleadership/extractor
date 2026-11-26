import fs from 'node:fs';

export function rleDecompress(buffer) {
    const chunks = [];
    let i = 0;
    while (i < buffer.length) {
        const count = buffer[i++];
        if (i >= buffer.length) break;
        const value = buffer[i++];
        chunks.push(Buffer.alloc(count, value));
    }
    return Buffer.concat(chunks);
}

export function rleDecompressFile(inputPath, outputPath) {
    const resultat = rleDecompress(fs.readFileSync(inputPath));
    if (outputPath) {
        fs.writeFileSync(outputPath, resultat);
    }
    return resultat;
}
