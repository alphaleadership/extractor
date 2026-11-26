import fs from 'node:fs';

export function hexDump(buffer, bytesPerLine = 16) {
    let output = '';
    for (let i = 0; i < buffer.length; i += bytesPerLine) {
        const chunk = buffer.subarray(i, i + bytesPerLine);
        const offset = i.toString(16).padStart(8, '0');
        const hex = Array.from(chunk)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(' ')
            .padEnd(bytesPerLine * 3 - 1, ' ');
        const ascii = Array.from(chunk)
            .map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.'))
            .join('');
        output += `${offset}  ${hex}  |${ascii}|\n`;
    }
    return output;
}

export function saveHexRaw(buffer, outputPath) {
    fs.writeFileSync(outputPath, buffer.toString('hex'), 'utf8');
    return buffer.toString('hex');
}
