const SIGNATURE_PNG = [137, 80, 78, 71];
const MARQUEUR_IEND = [73, 69, 78, 68];

function chercherSequence(buffer, sequence, depuis = 0) {
    for (let i = depuis; i <= buffer.length - sequence.length; i++) {
        let ok = true;
        for (let j = 0; j < sequence.length; j++) {
            if (buffer[i + j] !== sequence[j]) {
                ok = false;
                break;
            }
        }
        if (ok) return i;
    }
    return -1;
}

export function findPngStart(buffer) {
    return chercherSequence(buffer, SIGNATURE_PNG);
}

export function findPngEnd(buffer, depuis = 0) {
    const index = chercherSequence(buffer, MARQUEUR_IEND, depuis);
    return index === -1 ? -1 : index + MARQUEUR_IEND.length + 4;
}

export function extractPng(buffer) {
    const debut = findPngStart(buffer);
    if (debut === -1) return buffer;
    const fin = findPngEnd(buffer, debut);
    if (fin === -1 || fin > buffer.length) return buffer.subarray(debut);
    return buffer.subarray(debut, fin);
}
