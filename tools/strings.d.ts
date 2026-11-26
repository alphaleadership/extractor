// strings.d.ts — types de l'extracteur de chaînes.
export function extractStrings(buf: Buffer, min?: number): Array<{ offset: number; text: string }>;
