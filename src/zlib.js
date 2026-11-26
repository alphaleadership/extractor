import fs from 'node:fs';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';

export function inflateRaw(buffer) {
    return zlib.inflateRawSync(buffer);
}

export async function inflateRawFile(inputPath, outputPath) {
    const source = fs.createReadStream(inputPath);
    const destination = fs.createWriteStream(outputPath);
    await pipeline(source, zlib.createInflateRaw(), destination);
    return fs.readFileSync(outputPath);
}
