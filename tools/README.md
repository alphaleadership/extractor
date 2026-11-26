# tools/ — outils d'extraction et d'analyse (JavaScript, zéro dépendance)

| Fichier | Rôle | Usage |
|---|---|---|
| `dsp.js` | Noyau DSP partagé : lecture/écriture WAV PCM, FFT, cosinus surélevé, convolution, I/Q stéréo | importé par les autres outils |
| `raies_vitesse.js` | Extrait les raies d'un WAV (pic max, centroïde, bande −3 dB, raies dominantes) | `node raies_vitesse.js <fichier.wav\|dossier> [--seuil=-25] [--min-sep=30]` |
| `demod_qpsk.js` | Démodulateur QPSK complet (portage JS fidèle de `python/demod_qpsk.py`) : scan SPS/baud, filtres passe-haut/passe-bande (Butterworth filtfilt), filtre adapté RRC, suppression porteuse x^4, alignement constellation, SPS fractionnaire, décodage texte multi-essais (Gray/naturel, rotations, 7/8 bits), recomposition WAV, split/merge I-Q en BPSK, payload base64. Correctifs de troncature intégrés (ex-`patch_demod.py`) | `node demod_qpsk.js fichier.wav [--sps=N\|--baud=B\|--scan\|--scan-baud=lo-hi\|--freq=Hz\|--rrc[=beta]\|--bits\|--json\|--sync\|--recompose\|--swap-iq\|--split-iq\|--merge-iq]` |
| `filtre_cos_sureleve.js` | Filtre passe-haut en cosinus surélevé à la première zéro du spectre, réexport WAV | `node filtre_cos_sureleve.js entree.wav sortie.wav [--beta=0.35]` |
| `td04.js` | TD04 : `step1` (pulse train), `step2` (cosinus surélevé), `step3` (mise en forme), `guess` (fréquence : pic FFT + boucle de Costas) | `node td04.js step1\|step2\|step3\|guess <wav>` |

| `filetype.js` | Détecte le type réel d'un fichier par octets magiques | `node filetype.js <fichier> [...]` |
| `hashfile.js` | Empreintes (md5, sha1, sha256…) de fichiers | `node hashfile.js [--algo=sha256,md5] <fichier> [...]` |
| `xorcrack.js` | Casse un XOR répété (longueur de clé par IC + clé par score anglais) | `node xorcrack.js <fichier> [--max-key=32]` |

| `strings.js` | Extrait les chaînes imprimables d'un binaire | `node strings.js <fichier> [--min=4]` |
| `carve.js` | Extrait les fichiers embarqués par signatures magiques | `node carve.js <fichier> [--out=dossier]` |
| `unrle.js` | Décompresse un fichier RLE | `node unrle.js <entree.rle> <sortie>` |
| `b64.js` | Encode/décode base64 | `node b64.js encode\|decode <fichier\|texte>` |
| `hexview.js` | Dump hexadécimal | `node hexview.js <fichier> [--offset=N] [--length=N]` |
| `entropy.js` | Entropie, chi², IC (détection chiffrement/compression) | `node entropy.js <fichier>` |
| `caesar.js` | Casse César/Vigenère par fréquences | `node caesar.js <fichier> [--key=secret] [--top=5]` |

## Version Python complète (référence)

| Fichier | Rôle | Usage |
|---|---|---|
| `python/demod_qpsk.py` | Démodulateur QPSK complet (scan SPS/baud, filtres RRC/Butterworth, recomposition, graphiques PNG, décodage texte multi-essais, split/merge I-Q) — version Python historique, équivalente à `demod_qpsk.js` | `python tools/python/demod_qpsk.py fichier.wav [--json] [--scan] [--bits]` |
