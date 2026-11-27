// index.d.ts — définitions de types pour l'autocomplétion VS Code (IntelliSense).
// Couvre toutes les réexportations de index.js.

type BufferLike = Buffer | Uint8Array | string;

// ---------- src/rle.js ----------
export function rleDecompress(data: BufferLike): Buffer;
export function rleDecompressFile(inputPath: string, outputPath: string): Promise<string>;

// ---------- src/parts.js ----------
export function readListFile(listPath: string): string[];
export function concatFiles(paths: string[], outputPath: string): Promise<string>;
export function mergeParts(partsPrefix: string, outputPath: string): Promise<string>;

// ---------- src/sevenbit.js ----------
export function unpack7BitToAscii(data: BufferLike): string;
export function unpack7BitFile(inputPath: string, outputPath: string): Promise<string>;

// ---------- src/base64.js ----------
export function decodeBase64(input: string): Buffer;
export function decodeBase64File(inputPath: string, outputPath: string): Promise<string>;

// ---------- src/magicbytes.js ----------
export const FORMATS_MAGIQUES: Record<string, { extension: string; header: number[] }>;
export function xorDecode(data: BufferLike, key: number): Buffer;
export function findMagicKey(data: BufferLike, format: string): number | null;
export function extensionPourFormat(format: string): string | null;
export function restoreByMagicBytes(data: BufferLike, format?: string): { data: Buffer; format: string; extension: string };
export function restoreMagicFile(inputPath: string, outputPath?: string): Promise<string>;

// ---------- src/hex.js ----------
export function cleanHex(text: string): string;
export function hexToBuffer(hex: string): Buffer;
export function jsonHexToBuffer(json: string): Buffer;
export function extractHexFile(inputPath: string, outputPath: string): Promise<string>;

// ---------- src/zlib.js ----------
export function inflateRaw(data: BufferLike): Buffer;
export function inflateRawFile(inputPath: string, outputPath: string): Promise<string>;

// ---------- src/png.js ----------
export function findPngStart(data: BufferLike): number;
export function findPngEnd(data: BufferLike, start?: number): number;
export function extractPng(data: BufferLike): Buffer | null;

// ---------- src/packets.js ----------
export function countOccurrences(lines: string[]): Map<string, number>;
export function formatCountReport(counts: Map<string, number>): string;
export function splitPacketsText(text: string): string[];
export function dedupAndSortLines(lines: string[]): string[];
export function parsePacketLine(line: string): { prefix: string; payload: Buffer } | null;
export function cleanPayloadBuffers(buffers: Buffer[]): Buffer[];
export function payloadsByPrefix(packets: { prefix: string; payload: Buffer }[]): Record<string, Buffer[]>;
export function concatPayloads(payloads: Buffer[]): Buffer;
export function processPacketText(text: string): string;
export function processPacketFile(inputPath: string, outputPath: string): Promise<string>;

// ---------- src/bmp-steg.js ----------
export function bmpStegDecode(imgBuffer: Buffer): Buffer;
export function bmpStegDecodeFile(inputPath: string, outputPath: string): Promise<string>;

// ---------- src/acars.js ----------
export function buildAcarsMessage(overrides?: Record<string, unknown>): string;
export function sendAcars(message?: string, options?: { host?: string; port?: number }): Promise<unknown>;

// ---------- src/hosts.js ----------
export function getHostsPath(): string;
export function addDnsRecord(ip: string, domain: string, hostsPath?: string): Promise<void>;

// ---------- src/sync.js ----------
export function copyFolder(src: string, dest: string): Promise<void>;
export function getFolderSnapshot(folder: string): Promise<Record<string, string>>;
export function snapshotsEqual(a: Record<string, string>, b: Record<string, string>): boolean;
export function startSync(src: string, dest: string, intervalMs?: number): { stop: () => void };

// ---------- src/capture.js ----------
export const TSHARK_PAR_DEFAUT: string;
export function captureUntilDuplicate(options: { tshark?: string; outputPcap: string; count?: number; timeoutMs?: number }): Promise<unknown>;
export function followUdpStream(options: { tshark?: string; pcapPath: string; streamId: number | string }): Promise<string>;
export function parseFollowYaml(yamlText: string): unknown;
export function summarizeStream(packets: unknown[]): string;
export function saveStreamArtifacts(options: { yamlText: string; yamlPath: string; comptePath: string; imagePath: string }): Promise<void>;

// ---------- src/hexdump.js ----------
export function hexDump(data: BufferLike, bytesPerLine?: number): string;
export function saveHexRaw(data: BufferLike, outputPath: string): Promise<string>;

// ---------- src/entropy.js ----------
export const FREQUENCIES_ENGLISH: Record<string, number>;
export function byteFrequencies(buffer: BufferLike): Map<number, number>;
export function shannonEntropy(buffer: BufferLike): number;
export function chiSquared(buffer: BufferLike): number;
export function indexOfCoincidence(texte: string): number;
export function letterFrequencies(texte: string): Record<string, number>;
export function scoreEnglish(texte: string): number;

// ---------- src/xor.js ----------
export function repeatingXor(data: BufferLike, key: BufferLike): Buffer;
export function xorBruteforceByte(data: BufferLike, knownPlaintext?: string): { key: number; score: number }[];
export function xorBruteforceKeyLength(data: BufferLike, maxLength?: number): { keyLength: number; score: number }[];
export function recoverKeyFromKnownPlaintext(data: BufferLike, knownPlaintext: BufferLike): Buffer;

// ---------- src/caesar.js ----------
export function caesarShift(texte: string, shift: number): string;
export function rot13(texte: string): string;
export function caesarBruteforce(texte: string, options?: { top?: number }): { shift: number; texte: string; score: number }[];
export function vigenereEncrypt(texte: string, key: string): string;
export function vigenereDecrypt(texte: string, key: string): string;
export function guessKeyLength(texte: string, options?: { min?: number; max?: number }): { keyLength: number; score: number }[];
export function vigenereBruteforce(texte: string, options?: { keyLength?: number }): { key: string; texte: string; score: number }[];

// ---------- src/aes512.js ----------
export function aes512GenerateKey(longueur?: number): Buffer;
export function aes512CreateCipher(key: BufferLike): unknown;
export function aes512Encrypt(data: BufferLike, key: BufferLike): Buffer;
export function aes512Decrypt(data: BufferLike, key: BufferLike): Buffer;
export function aes512EncryptFile(path: string, key: BufferLike, options?: Record<string, unknown>): Promise<string>;
export function aes512DecryptFile(path: string, key: BufferLike, options?: Record<string, unknown>): Promise<string>;
export function aes512Hash(data: BufferLike, key: BufferLike): string;
export const aes512Module: Record<string, unknown>;

// ---------- src/aes.js ----------
export function pkcs7Pad(data: BufferLike, blockSize?: number): Buffer;
export function pkcs7Unpad(data: BufferLike, blockSize?: number): Buffer;
export function aesEncrypt(data: BufferLike, options: { key: BufferLike; iv?: BufferLike; algo?: string; padding?: boolean }): Buffer;
export function aesDecrypt(data: BufferLike, options: { key: BufferLike; iv?: BufferLike; algo?: string; padding?: boolean }): Buffer;
export function evpBytesToKey(password: string, salt: BufferLike, keyLength?: number, ivLength?: number, options?: { digest?: string }): { key: Buffer; iv: Buffer };
export function parseOpenSslFormat(buffer: BufferLike): { salt: Buffer; data: Buffer } | null;
export function opensslSaltedEncrypt(data: BufferLike, password: string, options?: { algo?: string; salt?: Buffer; digest?: string }): Buffer;
export function opensslSaltedDecrypt(buffer: BufferLike, password: string, options?: { algo?: string; digest?: string }): Buffer;

// ---------- src/des.js ----------
export function desEncrypt(data: BufferLike, options: { key: BufferLike; iv?: BufferLike; algo?: string; padding?: boolean }): Buffer;
export function desDecrypt(data: BufferLike, options: { key: BufferLike; iv?: BufferLike; algo?: string; padding?: boolean }): Buffer;

// ---------- src/rc4.js ----------
export function rc4(data: BufferLike, key: BufferLike): Buffer;
export function rc4Keystream(key: BufferLike, length: number): Buffer;

// ---------- src/chacha20.js ----------
export function chacha20Encrypt(data: BufferLike, key: BufferLike, nonce: BufferLike, options?: { counter?: number }): Buffer;
export function chacha20Decrypt(data: BufferLike, key: BufferLike, nonce: BufferLike, options?: { counter?: number }): Buffer;
export function chacha20Seal(data: BufferLike, key: BufferLike, nonce: BufferLike, options?: { aad?: BufferLike }): { ciphertext: Buffer; tag: Buffer };
export function chacha20Open(ciphertext: BufferLike, key: BufferLike, nonce: BufferLike, options: { tag: BufferLike; aad?: BufferLike }): Buffer;

// ---------- src/hash.js ----------
export const ALGORITHMES: string[];
export function digest(input: BufferLike, algorithm?: string, encoding?: 'hex' | 'base64' | 'latin1'): string;
export function digestFile(filePath: string, algorithm?: string, encoding?: string): Promise<string>;
export function hmacDigest(input: BufferLike, key: BufferLike, algorithm?: string, encoding?: string): string;
export function fileDigests(filePath: string, algorithms?: string[]): Promise<Record<string, string>>;

// ---------- src/kdf.js ----------
export function pbkdf2Derive(password: string, salt: BufferLike, iterations?: number, keyLength?: number, digest?: string): Buffer;
export function scryptDerive(password: string, salt: BufferLike, keyLength?: number, options?: Record<string, unknown>): Buffer;
export function hkdfDerive(ikm: BufferLike, salt?: BufferLike, info?: BufferLike, keyLength?: number, digest?: string): Buffer;
export function hashPassword(password: string, salt?: BufferLike): string;
export function verifyPassword(password: string, expected: string): boolean;

// ---------- src/encoding.js ----------
export function base32Encode(input: BufferLike, options?: { padding?: boolean }): string;
export function base32Decode(texte: string): Buffer;
export function base58Encode(input: BufferLike): string;
export function base58Decode(texte: string): Buffer;
export function base64UrlEncode(input: BufferLike): string;
export function base64UrlDecode(texte: string): Buffer;
export function ascii85Encode(input: BufferLike): string;
export function ascii85Decode(texte: string): Buffer;

// ---------- src/rsa.js ----------
export function generateRsaKeyPair(modulusBits?: number): Promise<{ publicKey: unknown; privateKey: unknown }>;
export function importPublicKey(pem: string | Buffer): unknown;
export function importPrivateKey(pem: string | Buffer): unknown;
export function exportPublicKey(key: unknown, format?: string): string;
export function exportPrivateKey(key: unknown, format?: string): string;
export function publicKeyFromPrivate(privateKey: unknown): unknown;
export function rsaEncrypt(data: BufferLike, publicKey: unknown): Buffer;
export function rsaDecrypt(data: BufferLike, privateKey: unknown): Buffer;
export function rsaSign(data: BufferLike, privateKey: unknown, algorithm?: string): Buffer;
export function rsaVerify(data: BufferLike, signature: BufferLike, publicKey: unknown, algorithm?: string): boolean;

// ---------- src/signature.js ----------
export function generateSigningKeyPair(): Promise<{ publicKey: string; privateKey: string }>;
export function signData(data: BufferLike, privateKey: string): string;
export function verifyData(data: BufferLike, signature: string, publicKey: string): boolean;

// ---------- tools/demod_qpsk.js ----------

export interface QpskComplex { re: number; im: number }

export const QPSK_POINTS: QpskComplex[];
export const QPSK_BITS: number[][];
export const MAPPINGS: Record<string, number[][]>;

export function rrcTaps(sps: number, beta: number, mult?: number): Float64Array;
export function rrcMatchedFilter(samples: QpskComplex[], fs: number, baud: number, beta?: number): QpskComplex[];
export function bandpassFilter(samples: QpskComplex[], fs: number, centerHz: number, bandwidthHz: number, order?: number): QpskComplex[];
export function removeCarrierFreq(samples: QpskComplex[], fs: number, freqHz?: number | null): { samples: QpskComplex[]; freqEst: number };
export function alignConstellation(samples: QpskComplex[]): { samples: QpskComplex[]; corrDeg: number };
export function estimateSps(samples: QpskComplex[], fs: number, minSps?: number, maxSps?: number): number;
export function findBestOffset(samples: QpskComplex[], sps: number): number;
export function sampleSymbolsFrac(samples: QpskComplex[], spsFloat: number, offsetFrac?: number): QpskComplex[];
export function scanSps(samples: QpskComplex[], fs: number, minSps?: number, maxSps?: number, topN?: number): Array<{ sps: number; offset: number; evmPct: number; snrDb: number; baud: number }>;
export function findBestOffsetFrac(samples: QpskComplex[], spsFloat: number, nSteps?: number): { offset: number; evm: number };
export function qpskDecide(symbols: QpskComplex[]): { decided: QpskComplex[]; indices: number[]; bits: number[] };
export function computeMetrics(symbols: QpskComplex[], decided: QpskComplex[], bits: number[]): Record<string, unknown>;
export function bitsToBytes(bits: number[]): number[];
export function bytesToHex(d: number[], limit?: number): string;
export function bytesToAscii(d: number[], limit?: number): string;
export function findSync(bits: number[], preamble?: string): number;
export function decodeBestText(indices: number[], marker?: string): Record<string, unknown>;
export function recomposeQpsk(decided: QpskComplex[], spsFloat: number, fs: number, offset?: number, rrcBeta?: number | null): QpskComplex[];
export function saveRecomposedWav(decided: QpskComplex[], spsFloat: number, fs: number, file: string, offset?: number): string;
export function decodeBpskVoie(voie: ArrayLike<number>, fs: number, baud: number, marker?: string | null, tol?: number): Record<string, unknown>;
export function mergeIqTrain(chaineI: Buffer, chaineQ: Buffer, searchShift?: boolean): { train: Buffer; shift: number; score: number };
export function decodeB64Payload(train: Buffer): { text: string | null; nums: number[] };
export function writePixelsTxt(nums: number[], txtPath: string, rawText?: string | null): number;
export function demodQpsk(file: string, opts?: Record<string, unknown>): Record<string, unknown>;
