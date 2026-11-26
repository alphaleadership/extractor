import fs from 'node:fs';

export function unpack7BitToAscii(buffer, { nonImprimable = '.' } = {}) {
    let output = '';
    let shift = 0;
    let accum = 0;

    const versCaractere = (charCode) => {
        if (charCode >= 32 || charCode === 10 || charCode === 13) {
            return String.fromCharCode(charCode);
        }
        return nonImprimable;
    };

    for (let i = 0; i < buffer.length; i++) {
        const currentByte = buffer[i];
        const charCode = ((currentByte << shift) | accum) & 0x7F;
        output += versCaractere(charCode);

        accum = currentByte >> (7 - shift);
        shift += 1;

        if (shift === 7) {
            output += versCaractere(accum & 0x7F);
            shift = 0;
            accum = 0;
        }
    }
    return output;
}

export function unpack7BitFile(inputPath, options) {
    return unpack7BitToAscii(fs.readFileSync(inputPath), options);
}
