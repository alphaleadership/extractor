import fs from 'node:fs';

export function decodeBase64(input) {
    return Buffer.from(String(input).trim(), 'base64');
}

export function decodeBase64File(inputPath, outputPath) {
    const buffer = decodeBase64(fs.readFileSync(inputPath, 'utf8'));
    if (outputPath) {
        fs.writeFileSync(outputPath, buffer);
    }
    return buffer;
}
