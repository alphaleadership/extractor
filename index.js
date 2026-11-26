export { rleDecompress, rleDecompressFile } from './src/rle.js';
export { readListFile, concatFiles, mergeParts } from './src/parts.js';
export { unpack7BitToAscii, unpack7BitFile } from './src/sevenbit.js';
export { decodeBase64, decodeBase64File } from './src/base64.js';
export {
    FORMATS_MAGIQUES,
    xorDecode,
    findMagicKey,
    extensionPourFormat,
    restoreByMagicBytes,
    restoreMagicFile
} from './src/magicbytes.js';
export { cleanHex, hexToBuffer, jsonHexToBuffer, extractHexFile } from './src/hex.js';
export { inflateRaw, inflateRawFile } from './src/zlib.js';
export { findPngStart, findPngEnd, extractPng } from './src/png.js';
export {
    countOccurrences,
    formatCountReport,
    splitPacketsText,
    dedupAndSortLines,
    parsePacketLine,
    cleanPayloadBuffers,
    payloadsByPrefix,
    concatPayloads,
    processPacketText,
    processPacketFile
} from './src/packets.js';
export { bmpStegDecode, bmpStegDecodeFile } from './src/bmp-steg.js';
export { buildAcarsMessage, sendAcars } from './src/acars.js';
export { getHostsPath, addDnsRecord } from './src/hosts.js';
export { copyFolder, getFolderSnapshot, snapshotsEqual, startSync } from './src/sync.js';
export {
    TSHARK_PAR_DEFAUT,
    captureUntilDuplicate,
    followUdpStream,
    parseFollowYaml,
    summarizeStream,
    saveStreamArtifacts
} from './src/capture.js';
export { hexDump, saveHexRaw } from './src/hexdump.js';

export {
    FREQUENCIES_ENGLISH,
    byteFrequencies,
    shannonEntropy,
    chiSquared,
    indexOfCoincidence,
    letterFrequencies,
    scoreEnglish
} from './src/entropy.js';
export {
    repeatingXor,
    xorBruteforceByte,
    xorBruteforceKeyLength,
    recoverKeyFromKnownPlaintext
} from './src/xor.js';
export {
    caesarShift,
    rot13,
    caesarBruteforce,
    vigenereEncrypt,
    vigenereDecrypt,
    guessKeyLength,
    vigenereBruteforce
} from './src/caesar.js';
export {
    getkey as aes512GenerateKey,
    createCipher as aes512CreateCipher,
    encrypt as aes512Encrypt,
    decrypt as aes512Decrypt,
    encryptFile as aes512EncryptFile,
    decryptFile as aes512DecryptFile,
    hash as aes512Hash,
    aes512Module
} from './src/aes512.js';
export {
    pkcs7Pad,
    pkcs7Unpad,
    aesEncrypt,
    aesDecrypt,
    evpBytesToKey,
    parseOpenSslFormat,
    opensslSaltedEncrypt,
    opensslSaltedDecrypt
} from './src/aes.js';
export { desEncrypt, desDecrypt } from './src/des.js';
export { rc4, rc4Keystream } from './src/rc4.js';
export {
    chacha20Encrypt,
    chacha20Decrypt,
    chacha20Seal,
    chacha20Open
} from './src/chacha20.js';
export { ALGORITHMES, digest, digestFile, hmacDigest, fileDigests } from './src/hash.js';
export {
    pbkdf2Derive,
    scryptDerive,
    hkdfDerive,
    hashPassword,
    verifyPassword
} from './src/kdf.js';
export {
    base32Encode,
    base32Decode,
    base58Encode,
    base58Decode,
    base64UrlEncode,
    base64UrlDecode,
    ascii85Encode,
    ascii85Decode
} from './src/encoding.js';
export {
    generateRsaKeyPair,
    importPublicKey,
    importPrivateKey,
    exportPublicKey,
    exportPrivateKey,
    publicKeyFromPrivate,
    rsaEncrypt,
    rsaDecrypt,
    rsaSign,
    rsaVerify
} from './src/rsa.js';
export { generateSigningKeyPair, signData, verifyData } from './src/signature.js';
