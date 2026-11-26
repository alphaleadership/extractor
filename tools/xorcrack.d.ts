// xorcrack.d.ts — types du cassage XOR répété.
export function crackXor(data: Buffer, opts?: { min?: number; max?: number; top?: number }): Array<{ keyLength: number; key: Buffer; text: string; score: number }>;
