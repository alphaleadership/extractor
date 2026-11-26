import fs from 'node:fs';

export function cleanHex(hexData) {
    let nettoye = String(hexData).replace(/[^0-9a-fA-F]/g, '');
    if (nettoye.length % 2 !== 0) {
        nettoye = nettoye.slice(0, -1);
    }
    return nettoye;
}

export function hexToBuffer(hexData) {
    return Buffer.from(cleanHex(hexData), 'hex');
}

export function jsonHexToBuffer(json) {
    const hexData = json?.Data;
    if (!hexData) {
        throw new Error("Champ 'Data' introuvable ou vide dans le JSON");
    }
    return hexToBuffer(hexData);
}

export function extractHexFile(inputPath, outputPath) {
    const json = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const buffer = jsonHexToBuffer(json);
    if (outputPath) {
        fs.writeFileSync(outputPath, buffer);
    }
    return buffer;
}
