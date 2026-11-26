// filetype.d.ts — types de la détection de format.
export function detectFormat(buf: Buffer): { format: string; extension: string } | null;
