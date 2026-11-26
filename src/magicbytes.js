import fs from 'node:fs';

export const FORMATS_MAGIQUES = {
    'Windows EXE (format PE/MZ)': [0x4D, 0x5A],
    'Archive ZIP / Fichier Office': [0x50, 0x4B, 0x03, 0x04],
    'Exécutable Linux (ELF)': [0x7F, 0x45, 0x4C, 0x46],
    'Image PNG': [0x89, 0x50, 0x4E, 0x47],
    'Document PDF': [0x25, 0x50, 0x44, 0x46],
    'Archive GZIP': [0x1F, 0x8B],
    'Archive BZIP2': [0x42, 0x5A, 0x68]
};

const EXTENSIONS = [
    ['EXE', 'exe'],
    ['ZIP', 'zip'],
    ['PNG', 'png'],
    ['PDF', 'pdf']
];

export function xorDecode(data, cle) {
    const out = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) {
        out[i] = data[i] ^ cle[i % cle.length];
    }
    return out;
}

function correspond(debutDechiffre, magic) {
    for (let j = 0; j < magic.length; j++) {
        if (debutDechiffre[j] !== magic[j]) return false;
    }
    return true;
}

function testerCle(data, cle) {
    const debut = [];
    for (let i = 0; i < Math.min(data.length, 4); i++) {
        debut.push(data[i] ^ cle[i % cle.length]);
    }
    return debut;
}

export function findMagicKey(data) {
    for (const [nom, magic] of Object.entries(FORMATS_MAGIQUES)) {
        const cle = [data[0] ^ magic[0], data[1] ^ magic[1]];
        if (correspond(testerCle(data, cle), magic)) {
            return { nom, cle };
        }
    }

    for (const [nom, magic] of Object.entries(FORMATS_MAGIQUES)) {
        const k0 = data[0] ^ magic[0];
        const k1 = data[1] ^ magic[1];
        const k2Base = magic[2] !== undefined ? data[2] ^ magic[2] : null;
        const k3Base = magic[3] !== undefined ? data[3] ^ magic[3] : null;

        for (let k2 = k2Base !== null ? k2Base : 0; k2 <= (k2Base !== null ? k2Base : 255); k2++) {
            for (let k3 = k3Base !== null ? k3Base : 0; k3 <= (k3Base !== null ? k3Base : 255); k3++) {
                const cle = [k0, k1, k2, k3];
                if (correspond(testerCle(data, cle), magic)) {
                    return { nom, cle };
                }
            }
        }
    }
    return null;
}

export function extensionPourFormat(nomFormat) {
    for (const [motif, ext] of EXTENSIONS) {
        if (nomFormat.includes(motif)) return ext;
    }
    return 'bin';
}

export function restoreByMagicBytes(data) {
    const trouve = findMagicKey(data);
    if (!trouve) return null;
    return {
        nom: trouve.nom,
        cle: trouve.cle,
        extension: extensionPourFormat(trouve.nom),
        data: xorDecode(data, trouve.cle)
    };
}

export function restoreMagicFile(inputPath, outputPath) {
    const resultat = restoreByMagicBytes(fs.readFileSync(inputPath));
    if (!resultat) return null;
    const cible = outputPath ?? `restaure_magicbit.${resultat.extension}`;
    fs.writeFileSync(cible, resultat.data);
    return { ...resultat, chemin: cible };
}
