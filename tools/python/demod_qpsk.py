#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Demodulateur QPSK pour fichier WAV
====================================
Extrait les informations d'un signal QPSK enregistre dans un fichier .wav
(sample rate, symboles, bits, constellation, EVM, SNR, donnees extraites...)

Usage:
    python demod_qpsk.py fichier.wav [options]

Options:
    --sps N          Echantillons par symbole (defaut: auto-detection)
    --offset N       Offset d'echantillonnage (defaut: auto)
    --freq Hz        Frequence porteuse a supprimer (defaut: auto/0)
    --show           Affiche les graphiques a l'ecran (en plus du PNG)
    --save-plot FICHIER  Chemin PNG personnalise (defaut: <wav>_qpsk.png)
    --no-plot        Ne PAS enregistrer de graphique PNG
    --bits           Affiche les bits extraits
    --json           Sortie au format JSON
    --max-bits N     Nombre max de bits a afficher (defaut: 512)
    --sync           Cherche preambule 0101... pour aligner les donnees

Les graphiques (constellation, spectre, forme d'onde, amplitude, phase)
sont automatiquement enregistres dans un PNG a cote du fichier WAV analyse.

Dépendances:
    pip install numpy scipy matplotlib

Format WAV attendu:
    - Stereo 16-bit: canal 1 = I, canal 2 = Q (signal complexe bande de base)
    - Mono: signal reel (transpose en complexe via Hilbert)
"""

import argparse
import json
import wave

import numpy as np

try:
    from scipy import signal as sp_signal
except ImportError:
    sp_signal = None


# ---------------------------------------------------------------------------
# Lecture WAV
# ---------------------------------------------------------------------------

def read_wav(path):
    """Lit un fichier WAV. Retourne (samples, sample_rate, infos)."""
    with wave.open(path, 'rb') as wf:
        n_channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)
        # WAV tronque/corrompu: ignorer les octets d'un echantillon incomplet
        # (sinon np.frombuffer leve "buffer size must be a multiple of element size")
        residu = len(raw) % sampwidth
        if residu:
            raw = raw[:len(raw) - residu]

    if sampwidth == 1:
        data = np.frombuffer(raw, dtype=np.uint8).astype(np.float64) - 128.0
    elif sampwidth == 2:
        data = np.frombuffer(raw, dtype=np.int16).astype(np.float64)
    elif sampwidth == 4:
        data = np.frombuffer(raw, dtype=np.int32).astype(np.float64)
    else:
        raise ValueError(f"Profondeur non supportee: {sampwidth} octets")

    data /= float(2 ** (8 * sampwidth - 1))

    if n_channels == 2:
        # SEPARATION DES DEUX VOIES: canal 1 = I (gauche), canal 2 = Q (droite)
        # Tronque a un nombre PAIR d'echantillons: si len(data) est impair
        # (WAV stereo tronque), data[0::2] et data[1::2] n'ont pas la meme
        # longueur et "voie_I + 1j * voie_Q" leve une erreur de broadcast.
        if len(data) % 2:
            data = data[:len(data) - 1]
        voie_I = data[0::2].copy()
        voie_Q = data[1::2].copy()
        samples = voie_I + 1j * voie_Q
        mode = "complexe I/Q (stereo)"
        voies_info = {
            "voie_I_canaux": "gauche/CH1 (0::2)",
            "voie_Q_canaux": "droite/CH2 (1::2)",
            "I_mean": round(float(voie_I.mean()), 6),
            "I_std": round(float(voie_I.std()), 6),
            "Q_mean": round(float(voie_Q.mean()), 6),
            "Q_std": round(float(voie_Q.std()), 6),
            "correlation_IQ": round(float(np.corrcoef(voie_I, voie_Q)[0, 1]), 6),
        }
    elif n_channels == 1:
        samples = data.astype(np.complex128)
        mode = "reel mono -> complexe"
        voies_info = None
    else:
        samples = data.reshape(-1, n_channels).mean(axis=1).astype(np.complex128)
        mode = f"moyenne {n_channels} canaux"

    infos = {
        "fichier": path,
        "sample_rate_Hz": framerate,
        "canaux": n_channels,
        "bits_par_sample": sampwidth * 8,
        "duree_s": round(n_frames / framerate, 4),
        "nb_echantillons": int(len(samples)),
        "mode": mode,
        "voies": voies_info,
    }
    return samples, framerate, infos


# ---------------------------------------------------------------------------
# Prétraitement
# ---------------------------------------------------------------------------

def normalize(samples):
    s = samples - np.mean(samples)
    p = np.sqrt(np.mean(np.abs(s) ** 2))
    return s / p if p > 0 else s


def remove_dc_and_lowfreq(samples, fs, cutoff_hz=0.0):
    """
    Supprime la composante continue (DC offset) et optionnellement les
    parasites basse frequence par un filtre passe-haut Butterworth (ordre 4).
    - DC offset: TOUJOURS soustrait (moyenne)
    - Filtre passe-haut: applique seulement si cutoff_hz > 0
    Retourne (signal_filtre, dc_offset_supprime).
    """
    dc = np.mean(samples)
    s = samples - dc  # suppression DC toujours active
    if sp_signal is not None and cutoff_hz > 0 and cutoff_hz < fs / 2:
        nyq = fs / 2.0
        b, a = sp_signal.butter(4, cutoff_hz / nyq, btype='highpass')
        s = sp_signal.filtfilt(b, a, s)
    return s, complex(dc)


def rrc_matched_filter(samples, fs, baud, beta=0.35, ntaps_mult=10):
    """
    Filtre adapté Root-Raised-Cosine (matched filter) pour maximiser le SNR.
    sps = fs/baud (peut etre fractionnaire, on arrondit pour le filtre).
    Retourne le signal filtre.
    """
    if sp_signal is None or baud <= 0:
        return samples
    sps = max(2, int(round(fs / baud)))
    ntaps = sps * ntaps_mult + 1
    t = np.arange(-ntaps // 2, ntaps // 2 + 1) / sps
    h = np.zeros_like(t)
    for i, ti in enumerate(t):
        if abs(ti) < 1e-10:
            h[i] = 1 - beta + 4 * beta / np.pi
        elif beta > 0 and abs(abs(ti) - 1 / (4 * beta)) < 1e-10:
            h[i] = (beta / np.sqrt(2)) * ((1 + 2 / np.pi) * np.sin(np.pi / (4 * beta)) +
                                           (1 - 2 / np.pi) * np.cos(np.pi / (4 * beta)))
        else:
            h[i] = (np.sin(np.pi * ti * (1 - beta)) +
                    4 * beta * ti * np.cos(np.pi * ti * (1 + beta))) / \
                   (np.pi * ti * (1 - (4 * beta * ti) ** 2))
    h = h / np.sqrt(np.sum(h ** 2))
    s = np.convolve(samples, h, mode='same')
    return s


def bandpass_filter(samples, fs, center_hz, bandwidth_hz, order=6):
    """
    Filtre passe-bande Butterworth autour de center_hz avec la largeur bandwidth_hz.
    Pour un signal complexe en bande de base (center_hz=0), applique un passe-bas
    sur I et Q separement a bandwidth_hz/2 (equivalent passe-bande symetrique).
    Retourne (signal_filtre, (f_low, f_high)).
    """
    nyq = fs / 2.0
    if sp_signal is None or bandwidth_hz <= 0 or bandwidth_hz >= fs:
        return samples, (center_hz - bandwidth_hz / 2, center_hz + bandwidth_hz / 2)
    f_low = center_hz - bandwidth_hz / 2.0
    f_high = center_hz + bandwidth_hz / 2.0
    if abs(center_hz) < 1.0:
        # Signal complexe bande de base: passe-bas symetrique sur I et Q
        cutoff = bandwidth_hz / 2.0
        cutoff = min(cutoff, nyq - 1.0)
        b, a = sp_signal.butter(order, cutoff / nyq, btype='lowpass')
        s = sp_signal.filtfilt(b, a, np.real(samples)) + 1j * sp_signal.filtfilt(b, a, np.imag(samples))
    else:
        # Signal reel ou porteuse non nulle: passe-bande classique
        f_low = max(f_low, 1.0)
        f_high = min(f_high, nyq - 1.0)
        if f_high <= f_low:
            return samples, (f_low, f_high)
        b, a = sp_signal.butter(order, [f_low / nyq, f_high / nyq], btype='bandpass')
        s = sp_signal.filtfilt(b, a, samples)
    return s, (f_low, f_high)


def remove_carrier_freq(samples, fs, freq_hz=None):
    """
    Supprime la derive de frequence porteuse par la methode x^4.
    Retourne (signal, freq_estimee_Hz).
    """
    n = np.arange(len(samples))
    if freq_hz:
        f_norm = freq_hz / fs
        return samples * np.exp(-1j * 2 * np.pi * f_norm * n), float(freq_hz)

    # Estimation automatique: pente de la phase de x^4
    x4 = samples ** 4
    phase_x4 = np.unwrap(np.angle(x4))
    if len(phase_x4) > 10:
        slope = np.polyfit(n, phase_x4, 1)[0]
        f_offset = slope / (4 * 2 * np.pi)  # cycles/echantillon
    else:
        f_offset = 0.0
    corrected = samples * np.exp(-1j * 2 * np.pi * f_offset * n)
    return corrected, float(f_offset * fs)


def align_constellation(samples):
    """
    Aligne la constellation QPSK sur les positions standard (45, 135, 225, 315 degres).
    Utilise x^4: pour QPSK correct, mean(x^4) doit avoir phase = pi (180 degres).
    Retourne (signal_aligne, phase_correction_deg).
    """
    mean_x4 = np.mean(samples ** 4)
    if abs(mean_x4) < 1e-12:
        return samples, 0.0
    # Phase actuelle de x^4 / 4 = rotation du signal
    current_phase = np.angle(mean_x4) / 4.0  # radians
    # On veut que la rotation soit pi/4 (45 deg) mod pi/2
    # Correction = pi/4 - current_phase, ramenee dans [-pi/4, pi/4]
    target = np.pi / 4
    corr = (target - current_phase + np.pi / 4) % (np.pi / 2) - np.pi / 4
    aligned = samples * np.exp(1j * corr)  # on tourne de +corr
    return aligned, float(np.degrees(corr))


# ---------------------------------------------------------------------------
# Estimation SPS
# ---------------------------------------------------------------------------

def estimate_sps(samples, fs, min_sps=2, max_sps=64):
    """Estime le SPS via la raie spectrale de |x|^4 a fs/SPS."""
    x = np.abs(samples) ** 4
    x = x - np.mean(x)
    n = len(x)
    nfft = 2 ** int(np.ceil(np.log2(max(n * 4, 1024))))
    spec = np.abs(np.fft.fft(x, nfft))

    best_sps, best_val = 8, 0.0
    for sps in range(min_sps, max_sps + 1):
        f_target = 1.0 / sps
        idx = int(round(f_target * nfft))
        if idx < 1 or idx >= nfft // 2:
            continue
        window = spec[idx - 1: idx + 2].sum()
        if window > best_val:
            best_val = window
            best_sps = sps
    return best_sps


# ---------------------------------------------------------------------------
# Timing recovery
# ---------------------------------------------------------------------------

def find_best_offset(samples, sps):
    """Trouve l'offset maximisant la 'proprete' des symboles echantillonnes."""
    best_offset, best_score = 0, -np.inf
    for off in range(sps):
        s = samples[off::sps]
        if len(s) < 4:
            continue
        amp = np.abs(s)
        # Score: faible variance d'amplitude = symboles bien centres
        score = -np.var(amp)
        if score > best_score:
            best_score = score
            best_offset = off
    return best_offset


def scan_sps(samples, min_sps=2, max_sps=200, top_n=10):
    """
    Balaye tous les SPS possibles et retourne les meilleurs candidats
    classes par EVM croissant.
    Retourne une liste de dicts: {sps, offset, evm, snr_db, baud}
    """
    results = []
    for sps in range(min_sps, max_sps + 1):
        best_evm = np.inf
        best_off = 0
        for off in range(sps):
            sym = samples[off::sps]
            if len(sym) < 10:
                continue
            # Alignement phase rapide par symbole
            ph = np.angle(np.mean(sym ** 4)) / 4.0
            corr = (np.pi / 4 - ph + np.pi / 4) % (np.pi / 2) - np.pi / 4
            sy = sym * np.exp(1j * corr)
            dec = np.array([QPSK_POINTS[np.argmin(np.abs(QPSK_POINTS - x))] for x in sy])
            evm = np.sqrt(np.mean(np.abs(sy - dec) ** 2))
            if evm < best_evm:
                best_evm = evm
                best_off = off
        if best_evm < np.inf:
            evm_pct = best_evm * 100
            snr = -20 * np.log10(best_evm) if best_evm > 1e-10 else 99.0
            results.append({
                "sps": sps,
                "offset": best_off,
                "evm_pct": round(float(evm_pct), 2),
                "snr_db": round(float(snr), 2),
                "baud": round(len(samples) and 80000 / sps, 1),  # placeholder, sera corrige
            })
    results.sort(key=lambda r: r["evm_pct"])
    return results[:top_n]


# ---------------------------------------------------------------------------
# Decision QPSK
# ---------------------------------------------------------------------------

# Constellation QPSK Gray: 00->45, 01->135, 11->225, 10->315
QPSK_POINTS = np.array([
    np.exp(1j * np.pi / 4),      # 0 -> 00
    np.exp(1j * 3 * np.pi / 4),  # 1 -> 01
    np.exp(1j * 5 * np.pi / 4),  # 2 -> 11
    np.exp(1j * 7 * np.pi / 4),  # 3 -> 10
])
QPSK_BITS = [(0, 0), (0, 1), (1, 1), (1, 0)]


def sample_symbols_frac(samples, sps_float, offset_frac=0.0):
    """
    Echantillonne avec un SPS fractionnaire par interpolation lineaire.
    sps_float = fs / baud (peut ne pas etre entier).
    Retourne les symboles echantillonnes aux instants offset + k*sps.
    """
    n = len(samples)
    positions = offset_frac + np.arange(int((n - offset_frac) / sps_float)) * sps_float
    positions = positions[positions < n]
    i0 = np.floor(positions).astype(int)
    frac = positions - i0
    i1 = np.minimum(i0 + 1, n - 1)
    return samples[i0] * (1 - frac) + samples[i1] * frac


def find_best_offset_frac(samples, sps_float, n_steps=50):
    """Cherche le meilleur offset fractionnaire en testant n_steps positions dans [0, sps)."""
    best_off, best_evm = 0.0, np.inf
    for k in range(n_steps):
        off = k * sps_float / n_steps
        sym = sample_symbols_frac(samples, sps_float, off)
        if len(sym) < 10:
            continue
        ph = np.angle(np.mean(sym ** 4)) / 4.0
        corr = (np.pi / 4 - ph + np.pi / 4) % (np.pi / 2) - np.pi / 4
        sy = sym * np.exp(1j * corr)
        dec = np.array([QPSK_POINTS[np.argmin(np.abs(QPSK_POINTS - x))] for x in sy])
        evm = np.sqrt(np.mean(np.abs(sy - dec) ** 2))
        if evm < best_evm:
            best_evm = evm
            best_off = off
    return best_off, best_evm


def qpsk_decide(symbols):
    """Decision dure par plus proche voisin."""
    decided = np.zeros(len(symbols), dtype=np.complex128)
    indices = np.zeros(len(symbols), dtype=np.int32)
    bits = np.zeros(len(symbols) * 2, dtype=np.uint8)

    for i, s in enumerate(symbols):
        d = np.abs(QPSK_POINTS - s)
        idx = int(np.argmin(d))
        decided[i] = QPSK_POINTS[idx]
        indices[i] = idx
        bits[2 * i], bits[2 * i + 1] = QPSK_BITS[idx]

    return decided, indices, bits


def decode_bpsk_voie(voie, fs, baud, marker=None, sps_override=None, tol=3):
    """
    Decode une voie reelle (I ou Q seule) en BPSK.
    Teste plusieurs SPS entiers autour de fs/baud (le resampling change la
    qualite) et garde celui qui trouve le marqueur avec la plus petite
    distance, le plus tot possible.
    Retourne dict avec bits, texte, hex, marker_pos, offset, sps, marker_dist.
    """
    from math import gcd
    v0 = voie - np.mean(voie)
    sps_float = fs / baud
    sps_base = sps_override or max(2, int(round(sps_float)))

    mb = None
    if marker:
        mb = np.array([(ord(c) >> k) & 1 for c in marker for k in range(7, -1, -1)], dtype=np.uint8)

    best = None  # (dist, -pos, off, bits, sps_used, fs_used)
    candidates = [sps_base + d for d in range(-6, 7)] if sps_override is None else [sps_override]
    for sps in candidates:
        if sps < 2:
            continue
        fs_new = baud * sps
        g = gcd(int(fs), int(round(fs_new)))
        up, down = int(round(fs_new)) // g, int(fs) // g
        if down > 40000:
            continue
        v = sp_signal.resample_poly(v0, up, down) if sp_signal is not None else v0
        v = v / np.sqrt(np.mean(v ** 2))
        if sp_signal is not None:
            cutoff = min(baud * 0.5, fs_new / 2 - 1)
            b, a = sp_signal.butter(6, cutoff / (fs_new / 2), btype='lowpass')
            v = sp_signal.filtfilt(b, a, v)
        for off in range(sps):
            sym = v[off::sps]
            if len(sym) < 10:
                continue
            bits = (sym > 0).astype(np.uint8)
            if mb is not None:
                mdist = 999
                mpos = -1
                for k in range(len(bits) - len(mb) + 1):
                    d = int(np.sum(bits[k:k + len(mb)] != mb))
                    if d < mdist:
                        mdist = d
                        mpos = k
                if mdist > tol:
                    continue
                cand = (mdist, mpos, off, bits, sps, fs_new, mpos)  # mpos croissant = plus tot = mieux
            else:
                p1 = bits.mean()
                ent = -p1 * np.log2(p1 + 1e-12) - (1 - p1) * np.log2(1 - p1 + 1e-12) if 0 < p1 < 1 else 0
                cand = (-int(ent * 1000), 0, off, bits, sps, fs_new, -1)
            if best is None or cand[:2] < best[:2]:
                best = cand
    if best is None:
        # fallback: sans marqueur, sps_base
        sps = sps_base
        v = v0 / np.sqrt(np.mean(v0 ** 2))
        bits = (v[::sps] > 0).astype(np.uint8)
        best = (999, 0, 0, bits, sps, fs, -1)
    mdist, negpos, best_off, bits, sps_used, fs_used, marker_pos = best

    start = marker_pos if marker_pos >= 0 else 0
    b = bits[start:]
    pad = (8 - len(b) % 8) % 8
    if pad:
        b = np.concatenate([b, np.zeros(pad, dtype=np.uint8)])
    by = b.reshape(-1, 8)
    w = np.array([128, 64, 32, 16, 8, 4, 2, 1], dtype=np.uint8)
    data = (by.astype(np.uint16) * w).sum(axis=1).astype(np.uint8)
    txt = ''.join(chr(c) if 32 <= c < 127 else '.' for c in data)
    return {
        "bits": bits, "texte": txt,
        "hex": ' '.join(f'{c:02X}' for c in data),
        "octets": data,
        "marker_pos": marker_pos,
        "marker_dist": mdist if marker_pos >= 0 else -1,
        "offset": best_off,
        "sps": sps_used,
        "nb_bits": int(len(bits)),
    }


def bits_of(data):
    """Octets -> liste de bits MSB first."""
    return [(int(c) >> k) & 1 for c in data for k in range(7, -1, -1)]


def bytes_of(bits):
    """Liste de bits MSB first -> octets."""
    out = bytearray()
    for k in range(0, len(bits) // 8 * 8, 8):
        v = 0
        for j in range(8):
            v = (v << 1) | int(bits[k + j])
        out.append(v)
    return bytes(out)


def merge_iq_train(chaine_i, chaine_q, search_shift=True):
    """
    Reconstitue le train binaire final QPSK depuis les deux voies BPSK.
    Mapping: bit de poids fort du symbole = bit I, bit de poids faible = bit Q.
    Verifie: I='vf'(0x7666) + Q='33'(0x3333) -> train='/---'(0x2F2D2D2D).

    Si search_shift: teste un decalage relatif entre I et Q de -16 a +16 bits
    (les deux cotes peuvent se desynchroniser d'un bit) et garde celui qui
    donne le meilleur train: commence par '/---' ET le payload base64 se
    decode proprement (longueur multiple de 4, que des [0-9:-]).
    Retourne (train_bytes, shift_applique, score).
    """
    import base64
    import re as _re
    bi = bits_of(chaine_i)
    bq = bits_of(chaine_q)
    target = bytes([0x2F, 0x2D, 0x2D, 0x2D])

    def interleave(bi, bq, shift_q):
        bq2 = bq[max(0, shift_q):] if shift_q >= 0 else [0] * (-shift_q) + bq
        n = min(len(bi), len(bq2))
        merged = []
        for k in range(n):
            merged.append(bi[k])       # bit fort = I
            merged.append(bq2[k])      # bit faible = Q
        return bytes_of(merged)

    def score_train(train):
        """Score de qualite: commence par /--- + b64 decode propre."""
        if train[:4] != target:
            return -1000
        s = 0
        m = _re.match(rb'/---(\d+)?---/(.*)', train, _re.DOTALL)
        if m:
            b64 = m.group(2)
            clean = bytes(c if (48 <= c <= 57 or 65 <= c <= 90 or 97 <= c <= 122 or c in (43, 47, 61))
                          else 65 for c in b64)
            # bonus si longueur multiple de 4 (pas de decalage de bits)
            if len(clean) % 4 == 0:
                s += 50
            clean4 = clean[:len(clean) // 4 * 4]
            try:
                dec = base64.b64decode(clean4)
                txt = ''.join(chr(c) if (48 <= c <= 57 or c in (58, 45, 46)) else '' for c in dec)
                # tous les caracteres doivent etre [0-9:-]
                propre = sum(1 for c in txt if c.isdigit() or c in ':-')
                s += propre / max(len(txt), 1) * 100
            except Exception:
                s -= 10
        return s

    if not search_shift:
        t = interleave(bi, bq, 0)
        return t, 0, score_train(t)

    best = None
    for shift in range(-16, 17):
        train = interleave(bi, bq, shift)
        sc = score_train(train)
        if best is None or sc > best[0]:
            best = (sc, shift, train)
    return best[2], best[1], best[0]


def rgb_image_from_bytes(data, save_path, width=None):
    """
    Interprete les octets comme une suite de pixels RGB (3 octets/pixel)
    et sauvegarde une image PNG. Si width est None, cherche la meilleure
    largeur par autocorrelation des lignes adjacentes.
    """
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    n_pix = len(data) // 3
    rgb = np.frombuffer(data[:n_pix * 3], dtype=np.uint8).reshape(n_pix, 3)
    if width is None:
        best_w, best_score = 16, -1
        for w in range(4, min(600, n_pix // 4) + 1):
            if n_pix % w != 0:
                continue
            h = n_pix // w
            if h < 2:
                continue
            img = rgb.reshape(h, w, 3).astype(float)
            a = img[:-1].ravel()
            b = img[1:].ravel()
            if len(a) > 1:
                score = np.corrcoef(a, b)[0, 1]
                if score > best_score:
                    best_score = score
                    best_w = w
        width = best_w
    h = n_pix // width
    img = rgb[:h * width].reshape(h, width, 3)
    fig, ax = plt.subplots(figsize=(max(4, width / 50), max(3, h / 50)))
    ax.imshow(img)
    ax.set_title(f'Image RGB reconstituee ({width}x{h}, {n_pix} pixels)')
    ax.axis('off')
    plt.tight_layout()
    plt.savefig(save_path, dpi=150)
    plt.close()
    return width, h, best_score if width else 0


def decode_b64_payload(train):
    """
    Extrait et decode la charge base64 d'un train commencant par /---NNN---/<b64>.
    Nettoie le resultat: ne garde que les caracteres ASCII imprimables [0-9:.-]
    (les erreurs de transmission produisent des octets non valides).
    Retourne (texte_decode_nettoye, liste_de_nombres).
    """
    import base64
    import re
    m = re.match(rb'/---(\d+)?---/(.*)', train, re.DOTALL)
    if not m:
        return None, []
    b64 = m.group(2)
    # garder l'alignement: remplacer les caracteres invalides par 'A'
    clean = bytes(c if (48 <= c <= 57 or 65 <= c <= 90 or 97 <= c <= 122 or c in (43, 47, 61))
                  else 65 for c in b64)
    clean = clean[:len(clean) // 4 * 4]
    try:
        dec = base64.b64decode(clean)
    except Exception:
        return None, []
    # NETTOYAGE ENCODAGE: ne garder que les caracteres utiles [0-9:.-]
    s = ''.join(chr(c) if (48 <= c <= 57 or c in (58, 45, 46)) else '' for c in dec)
    nums = [int(x) for x in re.findall(r'\d+', s)]
    return s, nums


def image_from_decimal_triplets(nums, save_path, width=None):
    """
    Construit une image RGB a partir d'une liste de nombres (triplets R,G,B).
    Les valeurs >255 sont clampees. Sauvegarde en PNG.
    """
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    n = len(nums) // 3
    vals = np.array(nums[:n * 3], dtype=np.int64)
    vals = np.clip(vals, 0, 255).astype(np.uint8)
    rgb = vals.reshape(n, 3)
    if width is None:
        best_w, best_score = 8, -1
        for w in range(2, min(400, n) + 1):
            if n % w != 0:
                continue
            h = n // w
            if h < 2:
                continue
            img = rgb.reshape(h, w, 3).astype(float)
            a = img[:-1].ravel(); b = img[1:].ravel()
            if len(a) > 1:
                sc = np.corrcoef(a, b)[0, 1]
                if sc > best_score:
                    best_score = sc; best_w = w
        width = best_w
    h = n // width
    img = rgb[:h * width].reshape(h, width, 3)
    fig, ax = plt.subplots(figsize=(max(4, width / 40), max(3, h / 40)))
    ax.imshow(img)
    ax.set_title(f'Image depuis triplets RGB ({width}x{h})')
    ax.axis('off')
    plt.tight_layout()
    plt.savefig(save_path, dpi=150)
    plt.close()
    return width, h


def write_pixels_txt(nums, txt_path, raw_text=None):
    """
    Ecrit un fichier texte avec UN GROUPE DE 5 VALEURS PAR LIGNE,
    valeurs separees par ':'. Dans le flux original, les groupes sont
    separes par '-'.
    Retourne le nombre de lignes (groupes) ecrites.
    """
    import re
    lines = []
    if raw_text:
        # split sur '-' -> un groupe par ligne
        for g in raw_text.split('-'):
            g = g.strip()
            if g:
                vals = re.findall(r'\d+', g)
                if vals:
                    lines.append(':'.join(vals))
    else:
        for i in range(0, len(nums) // 5 * 5, 5):
            lines.append(':'.join(str(v) for v in nums[i * 5:i * 5 + 5]))
    with open(txt_path, 'w', encoding='ascii') as f:
        f.write(f"# {len(lines)} groupes de 5 valeurs ('-' entre groupes dans le flux, ':' entre valeurs)\n")
        for ln in lines:
            f.write(ln + "\n")
    return len(lines)


def recompose_qpsk(decided_symbols, sps_float, fs, offset=0.0, rrc_beta=None):
    """
    Recomposition QPSK: regenere le signal a partir des symboles decides.
    - sur-echantillonnage: place chaque symbole a offset + k*sps_float
    - si rrc_beta: applique une mise en forme RRC
    Retourne le signal recompose (complexe, meme longueur approx que l'original).
    """
    n_sym = len(decided_symbols)
    n_samples = int(offset + (n_sym - 1) * sps_float) + 1
    signal = np.zeros(n_samples, dtype=np.complex128)
    positions = offset + np.arange(n_sym) * sps_float
    i0 = np.floor(positions).astype(int)
    frac = positions - i0
    i1 = np.minimum(i0 + 1, n_samples - 1)
    # zero-order hold pondere par interpolation
    for k in range(n_sym):
        signal[i0[k]] += decided_symbols[k] * (1 - frac[k])
        if i1[k] != i0[k]:
            signal[i1[k]] += decided_symbols[k] * frac[k]
    # Normalisation amplitude
    p = np.sqrt(np.mean(np.abs(signal) ** 2))
    if p > 0:
        signal = signal / p
    # Mise en forme RRC optionnelle
    if rrc_beta and rrc_beta > 0 and sp_signal is not None:
        sps = max(2, int(round(sps_float)))
        ntaps = sps * 10 + 1
        t = np.arange(-ntaps // 2, ntaps // 2 + 1) / sps
        h = np.zeros_like(t)
        for i, ti in enumerate(t):
            if abs(ti) < 1e-10:
                h[i] = 1 - rrc_beta + 4 * rrc_beta / np.pi
            elif abs(abs(ti) - 1 / (4 * rrc_beta)) < 1e-10:
                h[i] = (rrc_beta / np.sqrt(2)) * ((1 + 2 / np.pi) * np.sin(np.pi / (4 * rrc_beta)) +
                                                   (1 - 2 / np.pi) * np.cos(np.pi / (4 * rrc_beta)))
            else:
                h[i] = (np.sin(np.pi * ti * (1 - rrc_beta)) +
                        4 * rrc_beta * ti * np.cos(np.pi * ti * (1 + rrc_beta))) / \
                       (np.pi * ti * (1 - (4 * rrc_beta * ti) ** 2))
        h = h / np.sqrt(np.sum(h ** 2))
        signal = np.convolve(signal, h, mode='same')
    return signal


def save_recomposed_wav(decided_symbols, sps_float, fs, path, offset=0.0):
    """Sauvegarde le signal QPSK recompose dans un fichier WAV stereo I/Q."""
    import os
    sig = recompose_qpsk(decided_symbols, sps_float, fs, offset)
    peak = np.max(np.abs(sig))
    if peak > 0:
        sig = sig / peak * 0.9
    i = (np.real(sig) * 32767).astype(np.int16)
    q = (np.imag(sig) * 32767).astype(np.int16)
    interleaved = np.empty(len(i) * 2, dtype=np.int16)
    interleaved[0::2] = i
    interleaved[1::2] = q
    with wave.open(path, 'wb') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(int(fs))
        wf.writeframes(interleaved.tobytes())
    return path


# ---------------------------------------------------------------------------
# Metriques
# ---------------------------------------------------------------------------

def compute_metrics(symbols, decided, bits):
    evm = np.sqrt(np.mean(np.abs(symbols - decided) ** 2))
    evm_pct = evm * 100
    snr_db = -20 * np.log10(evm) if evm > 1e-10 else 999.0

    nb_bits = len(bits)
    p1 = float(np.mean(bits)) if nb_bits > 0 else 0.5
    entropy = -p1 * np.log2(p1) - (1 - p1) * np.log2(1 - p1) if 0 < p1 < 1 else 0.0

    counts = [int(np.sum(np.abs(symbols - p) < 0.6)) for p in QPSK_POINTS]

    return {
        "EVM_percent": round(float(evm_pct), 3),
        "SNR_estime_db": round(float(snr_db), 2) if snr_db < 999 else "inf",
        "nb_symboles": int(len(symbols)),
        "nb_bits": int(nb_bits),
        "entropie_bits": round(float(entropy), 4),
        "repartition_symboles": counts,
    }


# ---------------------------------------------------------------------------
# Bits -> octets
# ---------------------------------------------------------------------------

def bits_to_bytes(bits):
    pad = (8 - len(bits) % 8) % 8
    if pad:
        bits = np.concatenate([bits, np.zeros(pad, dtype=np.uint8)])
    b = bits.reshape(-1, 8)
    w = np.array([128, 64, 32, 16, 8, 4, 2, 1], dtype=np.uint8)
    return (b.astype(np.uint16) * w).sum(axis=1).astype(np.uint8)


def bytes_to_hex(data, limit=512):
    return ' '.join(f'{b:02X}' for b in data[:limit])


def bytes_to_ascii(data, limit=512):
    return ''.join(chr(b) if 32 <= b < 127 else '.' for b in data[:limit])


def find_sync(bits, preamble='0101010101010101010101010101010101'):
    """Cherche le preambule 0101... dans les bits."""
    pre = np.array([int(b) for b in preamble], dtype=np.uint8)
    n = len(pre)
    for i in range(len(bits) - n + 1):
        if np.array_equal(bits[i:i + n], pre):
            return i + n
    return 0


# ---------------------------------------------------------------------------
# Decodage texte multi-essais (mappings, rotations, shifts)
# ---------------------------------------------------------------------------

MAPPINGS = {
    "gray": [(0, 0), (0, 1), (1, 1), (1, 0)],
    "naturel": [(0, 0), (0, 1), (1, 0), (1, 1)],
}


def decode_best_text(indices, marker='//'):
    """
    Essaie toutes les combinaisons (mapping x rotation x shift x 7/8 bits)
    et retourne le meilleur texte printable trouve.
    Si un marqueur (ex: '//') est trouve dans les bits, le texte extrait
    commence a ce marqueur.
    indices: symboles 0..3 decides.
    """
    best = {"score": 0.0, "texte": "", "hex": "", "mapping": "", "rotation": 0,
            "shift": 0, "nbits": 8, "octets": b"", "marker_pos": -1}
    # pattern binaire du marqueur (8 bits/car)
    marker_bits = []
    for ch in marker.encode('ascii'):
        for k in range(7, -1, -1):
            marker_bits.append((ch >> k) & 1)
    marker_bits = np.array(marker_bits, dtype=np.uint8)
    mlen = len(marker_bits)

    for map_name, mapping in MAPPINGS.items():
        for rot in range(4):
            idx = (indices + rot) % 4
            bits = []
            for i in idx:
                bits.extend(mapping[i])
            bits = np.array(bits, dtype=np.uint8)
            # chercher le marqueur a n'importe quelle position bit
            marker_pos = -1
            if mlen <= len(bits):
                for pos in range(len(bits) - mlen + 1):
                    if np.array_equal(bits[pos:pos + mlen], marker_bits):
                        marker_pos = pos
                        break
            for shift in range(8):
                for nbits in (8, 7):
                    start = marker_pos if marker_pos >= 0 else shift
                    b = bits[start:]
                    pad = (nbits - len(b) % nbits) % nbits
                    if pad:
                        b = np.concatenate([b, np.zeros(pad, dtype=np.uint8)])
                    by = b.reshape(-1, nbits)
                    if nbits == 8:
                        w = np.array([128, 64, 32, 16, 8, 4, 2, 1], dtype=np.uint8)
                    else:
                        w = np.array([64, 32, 16, 8, 4, 2, 1], dtype=np.uint8)
                    data = (by.astype(np.uint16) * w).sum(axis=1).astype(np.uint8)
                    txt = ''.join(chr(c) if 32 <= c < 127 else '.' for c in data)
                    score = sum(1 for c in data if 32 <= c < 127) / max(len(data), 1)
                    # bonus si le texte commence par le marqueur
                    if marker_pos >= 0 and txt.startswith(marker):
                        score += 0.5
                    if score > best["score"]:
                        best = {
                            "score": round(min(score, 1.0), 3),
                            "texte": txt,
                            "hex": ' '.join(f'{c:02X}' for c in data),
                            "mapping": map_name, "rotation": rot,
                            "shift": shift, "nbits": nbits,
                            "octets": data.tobytes(),
                            "marker_pos": marker_pos,
                        }
    return best


# ---------------------------------------------------------------------------
# Graphiques
# ---------------------------------------------------------------------------

def plot_results(samples, symbols, decided, sps, fs, infos=None, metrics=None,
                 save_path=None, show=False, recomposed=None):
    import matplotlib
    if not show:
        matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    n_plots = 7 if recomposed is not None else 6
    ncols = 3
    nrows = (n_plots + ncols - 1) // ncols
    fig, axes = plt.subplots(nrows, ncols, figsize=(16, 4 * nrows))
    axes = axes.flatten()
    titre = 'Analyse QPSK'
    if infos:
        titre += f"  -  {infos['fichier']}  ({infos['sample_rate_Hz']} Hz, {infos['duree_s']} s)"
    fig.suptitle(titre, fontsize=11)

    # 1. Forme d'onde I/Q
    ax = axes[0]
    n_show = min(len(samples), 4000)
    t = np.arange(n_show) / fs * 1000
    ax.plot(t, np.real(samples[:n_show]), label='I orig', alpha=0.7, linewidth=0.8)
    ax.plot(t, np.imag(samples[:n_show]), label='Q orig', alpha=0.7, linewidth=0.8)
    if recomposed is not None:
        n_r = min(len(recomposed), 4000)
        tr = np.arange(n_r) / fs * 1000
        ax.plot(tr, np.real(recomposed[:n_r]), '--', label='I recompose', alpha=0.6, linewidth=0.8)
        ax.plot(tr, np.imag(recomposed[:n_r]), '--', label='Q recompose', alpha=0.6, linewidth=0.8)
    ax.set_xlabel('Temps (ms)'); ax.set_title('Forme d\'onde I/Q (orig vs recompose)'); ax.legend(fontsize=7)

    # 2. Spectre
    ax = axes[1]
    nfft = min(8192, len(samples))
    if sp_signal is not None and len(samples) >= nfft:
        f, pxx = sp_signal.welch(samples, fs, nperseg=nfft, return_onesided=False)
        pxx_db = 10 * np.log10(np.fft.fftshift(pxx) + 1e-20)
        ax.plot(np.fft.fftshift(f), pxx_db, linewidth=0.8, label='orig')
    else:
        spec = 20 * np.log10(np.abs(np.fft.fftshift(np.fft.fft(samples[:nfft], nfft))) + 1e-12)
        freqs = np.fft.fftshift(np.fft.fftfreq(nfft, 1 / fs))
        ax.plot(freqs, spec, linewidth=0.8, label='orig')
    if recomposed is not None:
        nfft2 = min(8192, len(recomposed))
        spec2 = 20 * np.log10(np.abs(np.fft.fftshift(np.fft.fft(recomposed[:nfft2], nfft2))) + 1e-12)
        freqs2 = np.fft.fftshift(np.fft.fftfreq(nfft2, 1 / fs))
        ax.plot(freqs2, spec2, '--', linewidth=0.8, label='recompose', alpha=0.7)
    ax.set_xlabel('Frequence (Hz)'); ax.set_title('Spectre'); ax.legend(fontsize=7)
    ax.grid(True, alpha=0.3)

    # 3. Constellation brute
    ax = axes[2]
    ax.scatter(np.real(symbols), np.imag(symbols), s=8, alpha=0.4, c='blue')
    ax.set_xlabel('I'); ax.set_ylabel('Q'); ax.set_title('Constellation (brute)')
    ax.axis('equal'); ax.grid(True, alpha=0.3)

    # 4. Constellation apres decision
    ax = axes[3]
    ax.scatter(np.real(symbols), np.imag(symbols), s=8, alpha=0.25, c='gray')
    ax.scatter(np.real(decided), np.imag(decided), s=25, c='red', marker='x', linewidths=0.8)
    ax.scatter(np.real(QPSK_POINTS), np.imag(QPSK_POINTS), s=150,
               facecolors='none', edgecolors='green', linewidths=2, label='Ideal')
    title4 = 'Constellation (decision)'
    if metrics:
        title4 += f"\nEVM={metrics['EVM_percent']}%  SNR~{metrics['SNR_estime_db']}dB"
    ax.set_title(title4, fontsize=9)
    ax.set_xlabel('I'); ax.set_ylabel('Q')
    ax.axis('equal'); ax.grid(True, alpha=0.3); ax.legend(fontsize=8)

    # 5. Amplitude des symboles
    ax = axes[4]
    ax.plot(np.abs(symbols), linewidth=0.6)
    ax.axhline(1.0, color='green', linestyle='--', alpha=0.5, label='|s|=1 (ideal)')
    ax.set_xlabel('Symbole #'); ax.set_ylabel('|s|')
    ax.set_title('Amplitude des symboles'); ax.grid(True, alpha=0.3); ax.legend(fontsize=8)

    # 6. Phase des symboles
    ax = axes[5]
    ax.plot(np.degrees(np.angle(symbols)), linewidth=0.6)
    for p in [45, 135, 225, 315]:
        ax.axhline(p, color='green', linestyle=':', alpha=0.4)
    ax.set_xlabel('Symbole #'); ax.set_ylabel('Phase (deg)')
    ax.set_title('Phase des symboles'); ax.grid(True, alpha=0.3)

    # 7. Erreur de recomposition (si recompose)
    if recomposed is not None:
        ax = axes[6]
        n_cmp = min(len(samples), len(recomposed))
        err = np.abs(samples[:n_cmp] - recomposed[:n_cmp])
        ax.plot(err[:4000], linewidth=0.6, color='purple')
        ax.set_xlabel('Echantillon #'); ax.set_ylabel('|err|')
        ax.set_title(f'Erreur recomposition (mean={np.mean(err):.4f})')
        ax.grid(True, alpha=0.3)
        # cacher les axes en trop
        for k in range(7, len(axes)):
            axes[k].axis('off')

    plt.tight_layout(rect=[0, 0, 1, 0.96])
    if save_path:
        plt.savefig(save_path, dpi=150)
        print(f"[PLOT] Graphiques enregistres: {save_path}")
    if show:
        plt.show()
    plt.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Demodulateur QPSK pour fichier WAV')
    parser.add_argument('wav_file', help='Chemin du fichier .wav')
    parser.add_argument('--sps', type=int, default=None, help='Echantillons/symbole (defaut: auto)')
    parser.add_argument('--baud', type=float, default=None,
                        help='Debit symbole en Baud (ex: 7810). SPS = fs/baud, peut etre fractionnaire')
    parser.add_argument('--scan', action='store_true',
                        help='Balayer tous les SPS de 2 a 200 et afficher le top 15 par EVM')
    parser.add_argument('--scan-baud', type=str, default=None,
                        help='Balayer une plage de baud: "7800-7820" ou "7810,1" (centre,pas)')
    parser.add_argument('--offset', type=int, default=None, help='Offset (defaut: auto)')
    parser.add_argument('--freq', type=float, default=None, help='Freq porteuse Hz a supprimer')
    parser.add_argument('--hp', type=float, default=0.0,
                        help='Coupure filtre passe-haut anti-parasites BF Hz (defaut: 0 = seule la composante DC est supprimee)')
    parser.add_argument('--bw', type=float, default=None,
                        help='Largeur du filtre passe-bande en Hz (defaut: auto = 1.1 x baud). 0 = desactive')
    parser.add_argument('--rrc', type=float, default=None, nargs='?', const=0.35,
                        help='Filtre adapté RRC (matched filter). Valeur = roll-off beta (defaut: 0.35). Sans valeur = 0.35. --rrc 0 = desactive')
    parser.add_argument('--show', action='store_true', help='Afficher les graphiques a l\'ecran')
    parser.add_argument('--save-plot', type=str, default=None,
                        help='Chemin PNG de sortie (defaut: <wav>_qpsk.png a cote du WAV)')
    parser.add_argument('--no-plot', action='store_true', help='Ne pas enregistrer les graphiques')
    parser.add_argument('--bits', action='store_true', help='Afficher les bits')
    parser.add_argument('--json', action='store_true', help='Sortie JSON')
    parser.add_argument('--max-bits', type=int, default=512, help='Max bits affiches')
    parser.add_argument('--sync', action='store_true', help='Aligner sur preambule 0101...')
    parser.add_argument('--recompose', action='store_true',
                        help='Recompose le signal QPSK a partir des symboles decides (WAV + graphique)')
    parser.add_argument('--save-text', action='store_true', default=True,
                        help='Sauvegarde le texte decode dans <wav>_texte.txt (defaut: oui)')
    parser.add_argument('--swap-iq', action='store_true',
                        help='Permuter les voies I et Q (CH1<->CH2)')
    parser.add_argument('--split-iq', action='store_true',
                        help='Decoder I (CH1) et Q (CH2) separement en BPSK -> data.outi / data.outq')
    parser.add_argument('--merge-iq', action='store_true',
                        help='Reconstituer le train binaire final depuis .outi/.outq (entrelacement I=bit fort, Q=bit faible) -> out.txt + image RGB')
    parser.add_argument('--marker-i', type=str, default='vf', help='Marqueur attendu voie I (defaut: vf)')
    parser.add_argument('--marker-q', type=str, default='33', help='Marqueur attendu voie Q (defaut: 33)')
    parser.add_argument('--marker', type=str, default='//',
                        help='Marqueur de debut de texte recherche dans les bits (defaut: //)')
    parser.add_argument('--no-text', action='store_true',
                        help='Ne pas sauvegarder le fichier texte')
    args = parser.parse_args()

    # 1. Lecture
    samples, fs, infos = read_wav(args.wav_file)

    # Mode split-iq: decodage BPSK separe de chaque voie
    if args.split_iq or args.merge_iq:
        import os
        # relire le WAV pour avoir I et Q bruts
        with wave.open(args.wav_file, 'rb') as wf:
            nc = wf.getnchannels()
            sw = wf.getsampwidth()
            raw = wf.readframes(wf.getnframes())
        if sw == 2:
            d = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
        else:
            d = np.frombuffer(raw, dtype=np.uint8).astype(np.float64) - 128.0
        if nc >= 2:
            I = d[0::2]
            Q = d[1::2]
        else:
            I = d
            Q = np.zeros_like(d)
        baud_val = args.baud if args.baud else fs / (args.sps or 10)
        print(f"\n[SPLIT-IQ] Decodage BPSK separe des 2 voies (baud={baud_val:.1f})")
        base = os.path.splitext(args.wav_file)[0]
        out_i = base + ".outi"
        out_q = base + ".outq"
        res_i = decode_bpsk_voie(I, fs, baud_val, args.marker_i)
        res_q = decode_bpsk_voie(Q, fs, baud_val, args.marker_q)
        for path, res, name in [(out_i, res_i, "I/CH1"), (out_q, res_q, "Q/CH2")]:
            with open(path, 'wb') as f:
                f.write(res["octets"])
            print(f"  Voie {name}: offset={res['offset']} bits={res['nb_bits']} "
                  f"marqueur@{res['marker_pos']} (dist={res['marker_dist']}) -> {path}")
            print(f"    hex  : {res['hex'][:120]}")
        if args.split_iq and not args.merge_iq:
            return {"split_iq": {"I": {"fichier": out_i, "marqueur_pos": res_i["marker_pos"]},
                                  "Q": {"fichier": out_q, "marqueur_pos": res_q["marker_pos"]}}}
        # sinon continuer vers le merge
        with open(out_i, 'rb') as f:
            chainei = f.read()
        with open(out_q, 'rb') as f:
            chaineq = f.read()
        train, shift, mscore = merge_iq_train(chainei, chaineq)
        out_path = base + "_out.txt"
        with open(out_path, 'wb') as f:
            f.write(train)
        print(f"\n[MERGE] Train reconstitue ({len(train)} octets, shift I/Q = {shift:+d} bits, score={mscore:.1f}) -> {out_path}")
        print(f"  Debut hex: {train[:12].hex()}")
        print(f"  Debut ascii: {train[:12]!r}")
        if train[:4] == bytes([0x2F, 0x2D, 0x2D, 0x2D]):
            print("  [OK] Le train commence par '/---' (0x2F2D2D2D) !")
        # decoder la charge base64 -> triplets RGB
        b64_txt, nums = decode_b64_payload(train)
        if b64_txt is not None:
            print(f"  [B64] Payload base64 decode ({len(nums)} nombres):")
            print(f"        {b64_txt[:200]}")
            if nums:
                img2_path = base + "_image_b64.png"
                pix_txt_path = base + "_pixels.txt"
                try:
                    w, h = image_from_decimal_triplets(nums, img2_path)
                    print(f"  [IMG-B64] Image depuis triplets RGB: {img2_path} ({w}x{h}, {len(nums)//3} pixels)")
                except Exception as e:
                    print(f"  [IMG-B64] erreur: {e}")
                npix = write_pixels_txt(nums, pix_txt_path, raw_text=b64_txt)
                print(f"  [PIXELS] {npix} pixels (R:G:B par ligne) -> {pix_txt_path}")
        # image RGB
        img_path = base + "_image.png"
        try:
            w, h, sc = rgb_image_from_bytes(train, img_path)
            print(f"  [IMG] Image RGB: {img_path} ({w}x{h})")
        except Exception as e:
            print(f"  [IMG] erreur: {e}")
        txt = ''.join(chr(c) if 32 <= c < 127 else f'[{c:02X}]' for c in train)
        print(f"  ASCII: {txt[:200]}")
        return {"merge": {"out_txt": out_path, "image": img_path, "taille": len(train),
                          "debut_hex": train[:12].hex()}}

    if args.swap_iq:
        samples = np.conj(samples)  # echange I/Q = conjugaison complexe
        infos["swap_IQ"] = True
    if np.allclose(np.imag(samples), 0) and sp_signal is not None:
        samples = sp_signal.hilbert(np.real(samples))

    # 1b. Suppression DC + parasites basse frequence (filtre passe-haut)
    samples, dc_offset = remove_dc_and_lowfreq(samples.astype(np.complex128), fs, args.hp)
    infos["dc_offset_supprime"] = {"re": round(dc_offset.real, 6), "im": round(dc_offset.imag, 6)}
    infos["filtre_passe_haut_Hz"] = args.hp

    samples = normalize(samples)

    # 2. Scan SPS optionnel
    if args.scan:
        print(f"\n[SCAN] Balayage SPS de 2 a 200 sur {len(samples)} echantillons...")
        # Alignement grossier d'abord
        corrected0, freq0 = remove_carrier_freq(samples, fs, args.freq)
        aligned0, _ = align_constellation(corrected0)
        scan = scan_sps(aligned0, min_sps=2, max_sps=200, top_n=15)
        print(f"\n{'SPS':>4} {'offset':>6} {'EVM%':>7} {'SNR dB':>7} {'Baud':>8} {'bps':>8}")
        for r in scan:
            baud = fs / r['sps']
            print(f"{r['sps']:4d} {r['offset']:6d} {r['evm_pct']:7.2f} {r['snr_db']:7.2f} {baud:8.1f} {baud*2:8.1f}")
        best = scan[0]
        print(f"\n>> Meilleur SPS = {best['sps']} (EVM={best['evm_pct']}%, {fs/best['sps']:.1f} Baud)")
        print(f"   Relance avec: --sps {best['sps']}")
        return {"scan": scan}

    # 2b. Scan baud optionnel
    if args.scan_baud:
        corrected0, freq0 = remove_carrier_freq(samples, fs, args.freq)
        aligned0, _ = align_constellation(corrected0)
        if '-' in args.scan_baud:
            lo, hi = args.scan_baud.split('-')
            bauds = list(range(int(float(lo)), int(float(hi)) + 1))
        elif ',' in args.scan_baud:
            centre, pas = args.scan_baud.split(',')
            centre = float(centre); pas = float(pas)
            bauds = [centre + k * pas for k in range(-10, 11)]
        else:
            bauds = [float(args.scan_baud)]
        print(f"\n[SCAN-BAUD] Balayage de {len(bauds)} valeurs de baud...")
        print(f"{'Baud':>9} {'SPS':>8} {'offset':>7} {'EVM%':>7} {'SNR dB':>7} {'symboles':>8}")
        results = []
        for baud in bauds:
            sps_f = fs / baud
            off, evm = find_best_offset_frac(aligned0, sps_f, n_steps=40)
            evm_pct = evm * 100
            snr = -20 * np.log10(evm) if evm > 1e-10 else 99
            nsym = int((len(aligned0) - off) / sps_f)
            results.append((evm_pct, baud, sps_f, off, snr, nsym))
            print(f"{baud:9.1f} {sps_f:8.4f} {off:7.2f} {evm_pct:7.2f} {snr:7.2f} {nsym:8d}")
        results.sort()
        best = results[0]
        print(f"\n>> Meilleur baud = {best[1]:.1f} Hz (EVM={best[0]:.2f}%, SPS={best[2]:.4f})")
        print(f"   Relance avec: --baud {best[1]:.1f}")
        return {"scan_baud": [{"baud": r[1], "sps": r[2], "evm_pct": r[0], "snr_db": r[4]} for r in results]}

    # 3. SPS ou Baud
    sps_float = None
    resampled = False
    if args.baud:
        sps_float = fs / args.baud
        # Si SPS pas entier, reechantillonner pour SPS entier exact (amelioration majeure)
        sps = int(round(sps_float))
        if sps >= 2 and abs(sps_float - sps) > 0.01 and sp_signal is not None:
            from math import gcd
            fs_new = int(round(args.baud * sps))
            g = gcd(int(fs), fs_new)
            up, down = fs_new // g, int(fs) // g
            samples = sp_signal.resample_poly(samples, up, down)
            fs = fs_new
            sps_float = fs / args.baud  # = sps exactement
            resampled = True
            infos["reechantillonnage"] = {"fs_orig": infos["sample_rate_Hz"], "fs_new": fs,
                                           "up": up, "down": down, "sps_exact": sps}
        else:
            sps = max(2, int(round(sps_float)))
        sps_auto = False
    elif args.sps:
        sps = args.sps
        sps_float = float(sps)
        sps_auto = False
    else:
        sps = estimate_sps(samples, fs)
        sps_float = float(sps)
        sps_auto = True

    # 4. Suppression derive frequence porteuse (seulement si --freq explicite,
    #    sinon la correction de phase se fait par symbole a l'etape align_constellation)
    if args.freq:
        corrected, freq_est = remove_carrier_freq(samples, fs, args.freq)
    else:
        corrected = samples
        freq_est = 0.0

    # 4b. Filtre passe-bande en bande de base pour eliminer les parasites hors bande
    bw_info = None
    if args.bw is None:
        bw = (args.baud if args.baud else fs / sps_float) * 1.1
    else:
        bw = args.bw
    if bw > 0 and bw < fs:
        corrected, (f_lo, f_hi) = bandpass_filter(corrected, fs, center_hz=0.0, bandwidth_hz=bw)
        bw_info = {"bandwidth_Hz": round(bw, 1), "f_low_Hz": round(f_lo, 1), "f_high_Hz": round(f_hi, 1)}
        infos["filtre_passe_bande"] = bw_info

    # 4c. Filtre adapté RRC (matched filter) pour maximiser le SNR
    if args.rrc is not None and args.rrc > 0:
        baud_val = args.baud if args.baud else fs / sps_float
        corrected = rrc_matched_filter(corrected, fs, baud_val, beta=args.rrc)
        infos["matched_filter_rrc"] = {"beta": args.rrc, "baud": round(baud_val, 1)}

    # 5. Echantillonnage (avant alignement phase pour plus de robustesse)
    sps_for_plot = sps_float
    if resampled or abs(sps_float - round(sps_float)) <= 0.01:
        # SPS entier exact (apres resampling ou non) -> echantillonnage direct
        offset = (args.offset % sps) if args.offset is not None else find_best_offset(corrected, sps)
        symbols = corrected[offset::sps]
    else:
        # SPS fractionnaire -> interpolation lineaire
        if args.offset is not None:
            offset_frac = args.offset
        else:
            offset_frac, _ = find_best_offset_frac(corrected, sps_float)
        offset = offset_frac
        symbols = sample_symbols_frac(corrected, sps_float, offset_frac)

    # 6. Alignement constellation sur les symboles echantillonnes (plus robuste)
    aligned_sym, phase_corr = align_constellation(symbols)
    aligned = corrected  # pour les graphiques (forme d'onde)
    symbols = aligned_sym

    # 7. Decision
    decided, indices, bits = qpsk_decide(symbols)

    # 7b. Decodage texte multi-essais (meilleur mapping/rotation/shift + marqueur //)
    best_text = decode_best_text(indices, marker=args.marker)

    # 7c. Recomposition QPSK (re-modulation a partir des symboles decides)
    recomposed = None
    recomposed_wav = None
    if args.recompose:
        recomposed = recompose_qpsk(decided, sps_float, fs, offset=float(offset))
        import os
        base = os.path.splitext(args.wav_file)[0]
        recomposed_wav = base + "_recompose.wav"
        save_recomposed_wav(decided, sps_float, fs, recomposed_wav, offset=float(offset))
        if not args.json:
            print(f"\n[RECOMPOSE] Signal QPSK recompose sauvegarde: {recomposed_wav}")

    # 8. Sync preambule
    sync_pos = find_sync(bits) if args.sync else 0
    bits_aligned = bits[sync_pos:] if sync_pos else bits

    # 9. Metriques
    metrics = compute_metrics(symbols, decided, bits)

    # 10. Donnees
    data_bytes = bits_to_bytes(bits_aligned)
    hex_str = bytes_to_hex(data_bytes)
    ascii_str = bytes_to_ascii(data_bytes)

    # 10b. Sauvegarde du texte recupere dans un fichier .txt (par defaut)
    text_path = None
    if not args.no_text:
        import os
        base = os.path.splitext(args.wav_file)[0]
        text_path = base + "_texte.txt"
        with open(text_path, 'w', encoding='utf-8') as f:
            f.write(f"=== Texte recupere depuis {args.wav_file} ===\n")
            f.write(f"Modulation: QPSK  |  Baud: {fs/sps_float:.2f}  |  SPS: {sps_float:.4f}\n")
            f.write(f"Symboles: {len(symbols)}  |  Bits: {len(bits)}  |  Octets: {len(data_bytes)}\n")
            f.write(f"EVM: {metrics['EVM_percent']}%  |  SNR estime: {metrics['SNR_estime_db']} dB\n")
            f.write(f"Mapping: {best_text['mapping']}  |  Rotation: {best_text['rotation']}  |  Shift: {best_text['shift']}  |  {best_text['nbits']} bits/car\n")
            f.write(f"\n--- HEX ---\n{hex_str}\n")
            f.write(f"\n--- ASCII (printable) ---\n{ascii_str}\n")
            f.write(f"\n--- TEXTE DECODE (meilleur score {best_text['score']:.0%}) ---\n{best_text['texte']}\n")
            f.write(f"\n--- BITS BRUTS ---\n{''.join(str(b) for b in bits)}\n")
        if not args.json:
            print(f"[TEXT] Texte sauvegarde dans: {text_path}")

    result = {
        "fichier": infos,
        "modulation": "QPSK",
        "parametres": {
            "sps": sps,
            "sps_float": round(float(sps_float), 4),
            "sps_auto": sps_auto,
            "baud_fourni": args.baud,
            "offset": round(float(offset), 3) if isinstance(offset, float) else offset,
            "debit_baud": round(fs / sps_float, 2),       # R = 1/T en Baud
            "debit_bps": round(fs / sps_float * 2, 2),
            "duree_moment_T_s": round(float(sps_float) / fs, 8),   # T = SPS/fs
            "largeur_lobe_B_Hz": round(fs / sps_float * 2, 2),     # B ~ 2*R (lobe principal rect)
            "freq_porteuse_Hz": round(freq_est, 4),
            "phase_correction_deg": round(phase_corr, 4),
            "sync_pos": sync_pos if args.sync else None,
        },
        "metriques": metrics,
        "donnees": {"nb_octets": int(len(data_bytes)), "hex": hex_str, "ascii": ascii_str},
        "recomposition_wav": recomposed_wav,
        "texte_txt": text_path,
        "texte_decode": {
            "meilleur_score_printable": best_text["score"],
            "mapping": best_text["mapping"],
            "rotation_constellation": best_text["rotation"],
            "shift_bits": best_text["shift"],
            "bits_par_caractere": best_text["nbits"],
            "marqueur_pos": best_text["marker_pos"],
            "texte": best_text["texte"][:500],
            "hex": best_text["hex"][:300],
        },
    }
    if args.bits:
        result["bits_bruts"] = ''.join(str(b) for b in bits[:args.max_bits])
        result["bits_total"] = int(len(bits))

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        L = "=" * 62
        print(L); print(f"  ANALYSE QPSK - {args.wav_file}"); print(L)
        print("\n[FICHIER]")
        print(f"   Sample rate : {infos['sample_rate_Hz']} Hz")
        print(f"   Canaux      : {infos['canaux']} ({infos['mode']})")
        print(f"   Duree       : {infos['duree_s']} s")
        print(f"   Echantillons: {infos['nb_echantillons']}")
        if 'dc_offset_supprime' in infos:
            dc = infos['dc_offset_supprime']
            hp = infos.get('filtre_passe_haut_Hz', 0)
            hp_txt = f", passe-haut {hp} Hz" if hp > 0 else ""
            print(f"   DC supprimé  : {dc['re']}{dc['im']:+.6f}j{hp_txt}")
        if infos.get('filtre_passe_bande'):
            bp = infos['filtre_passe_bande']
            print(f"   Filtre passe-bande: {bp['f_low_Hz']} .. {bp['f_high_Hz']} Hz (BW={bp['bandwidth_Hz']} Hz)")
        if infos.get('reechantillonnage'):
            r = infos['reechantillonnage']
            print(f"   Rééchantillonnage: {r['fs_orig']} -> {r['fs_new']} Hz (SPS exact = {r['sps_exact']})")
        if infos.get('voies'):
            v = infos['voies']
            print("\n[VOIES] Separation des 2 canaux stereo:")
            print(f"   Voie I (gauche) : mean={v['I_mean']}, std={v['I_std']}")
            print(f"   Voie Q (droite) : mean={v['Q_mean']}, std={v['Q_std']}")
            print(f"   Correlation I/Q : {v['correlation_IQ']}")
            print(f"   -> signal complexe = I + j*Q")
        print("\n[RF] Demodulation:")
        p = result['parametres']
        sps_str = f"{p['sps']}" if p['sps_float'] == p['sps'] else f"{p['sps_float']} (= SPS entier {p['sps']})"
        print(f"   SPS          : {sps_str}" + (" (auto)" if p['sps_auto'] else ""))
        if p.get('baud_fourni'):
            print(f"   Baud fourni  : {p['baud_fourni']}")
        print(f"   Offset       : {p['offset']}")
        print(f"   Debit symbole: {p['debit_baud']} Baud  (R = 1/T)")
        print(f"   Duree moment T: {p['duree_moment_T_s']*1e6:.2f} us")
        print(f"   Largeur lobe B: {p['largeur_lobe_B_Hz']} Hz")
        print(f"   Debit binaire: {p['debit_bps']} bps")
        print(f"   Freq porteuse: {p['freq_porteuse_Hz']} Hz")
        print(f"   Correction phase: {p['phase_correction_deg']} deg")
        if args.sync and p['sync_pos']:
            print(f"   Preambule trouve au bit #{p['sync_pos']}")
        print("\n[STATS] Metriques:")
        m = result['metriques']
        print(f"   Symboles : {m['nb_symboles']}  Bits : {m['nb_bits']}")
        print(f"   EVM      : {m['EVM_percent']} %")
        print(f"   SNR estime: {m['SNR_estime_db']} dB")
        print(f"   Entropie : {m['entropie_bits']} bits/bit")
        print(f"   Repart. symboles: {m['repartition_symboles']}")
        print(f"\n[DATA] Donnees ({result['donnees']['nb_octets']} octets):")
        print(f"   HEX   : {hex_str[:150]}{'...' if len(hex_str) > 150 else ''}")
        print(f"   ASCII : {ascii_str[:150]}{'...' if len(ascii_str) > 150 else ''}")
        td = result['texte_decode']
        marker_info = f", marqueur '{args.marker}' @ bit {td['marqueur_pos']}" if td.get('marqueur_pos', -1) >= 0 else ""
        print(f"\n[TEXTE] Meilleur decodage (printable={td['meilleur_score_printable']:.0%}, "
              f"mapping={td['mapping']}, rot={td['rotation_constellation']}, shift={td['shift_bits']}, {td['bits_par_caractere']}bits{marker_info}):")
        print(f"   {td['texte'][:250]}{'...' if len(td['texte']) > 250 else ''}")
        if args.bits:
            print(f"\n[BITS] ({min(args.max_bits, len(bits))}/{len(bits)} bits):")
            print(f"   {result['bits_bruts']}")
        print("\n" + L)

    # Graphiques: toujours enregistres par defaut a cote du WAV
    if not args.no_plot:
        import os
        if args.save_plot:
            plot_path = args.save_plot
        else:
            base = os.path.splitext(args.wav_file)[0]
            plot_path = base + "_qpsk.png"
        # Garder le chemin avec forward slashes (compatible PIL/matplotlib sur Windows)
        plot_path = os.path.abspath(plot_path).replace(os.sep, '/')
        try:
            plot_results(corrected, symbols, decided, sps_for_plot, fs, infos, metrics,
                         save_path=plot_path, show=args.show, recomposed=recomposed)
            result["graphique"] = plot_path
        except ImportError:
            if not args.json:
                print("\n[WARN] matplotlib non installe - graphiques ignores.")
                print("        pip install matplotlib")

    return result


if __name__ == '__main__':
    main()
