import fs from 'node:fs';

export function bmpStegDecode(imgBuffer) {
    const dataOffset = imgBuffer.readUInt32LE(10);
    let cursor = dataOffset;

    let secretSize = 0;
    for (let bitCount = 0; bitCount < 32; bitCount++) {
        if (cursor >= imgBuffer.length) {
            throw new Error("Image trop petite pour contenir la taille du secret.");
        }
        secretSize |= (imgBuffer[cursor] & 1) << bitCount;
        cursor++;
    }

    if (secretSize === 0 || secretSize > 10000000) {
        throw new Error("La taille lue est incorrecte. L'encodage diffère peut-être.");
    }

    const secretBuffer = Buffer.alloc(secretSize);
    let bytesExtracted = 0;

    while (bytesExtracted < secretSize) {
        let secretChar = 0;
        for (let bitCount = 0; bitCount < 8; bitCount++) {
            if (cursor >= imgBuffer.length) {
                return secretBuffer.subarray(0, bytesExtracted);
            }
            secretChar |= (imgBuffer[cursor] & 1) << bitCount;
            cursor++;
        }
        secretBuffer[bytesExtracted] = secretChar;
        bytesExtracted++;
    }

    return secretBuffer;
}

export async function bmpStegDecodeFile(inputPath, outputPath) {
    const secret = bmpStegDecode(await fs.promises.readFile(inputPath));
    if (outputPath) {
        await fs.promises.writeFile(outputPath, secret);
    }
    return secret;
}
