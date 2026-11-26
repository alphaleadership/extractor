// carve.d.ts — types du carve par signatures.
export function carveSignatures(buf: Buffer): Array<{ format: string; offset: number; end: number; extension: string }>;
