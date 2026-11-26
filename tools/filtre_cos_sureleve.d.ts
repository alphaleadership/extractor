// filtre_cos_sureleve.d.ts — types du filtre passe-haut cosinus surélevé.
export function raisedCosineHighpass(freqs: ArrayLike<number>, fZero: number, beta: number): Float64Array;
export function filterWav(inputPath: string, outputPath: string, beta?: number, seuil?: number): { fZero: number; beta: number; rate: number; frames: number };
