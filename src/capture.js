import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { load, YAML11_SCHEMA } from 'js-yaml';
import { countOccurrences, formatCountReport, concatPayloads } from './packets.js';
import { extractPng } from './png.js';

export const TSHARK_PAR_DEFAUT = 'C:\\Program Files\\Wireshark\\tshark.exe';

export function captureUntilDuplicate({
    tshark = TSHARK_PAR_DEFAUT,
    iface = '1',
    filter = 'udp port 22222',
    tmpFile = path.join(os.tmpdir(), `live_${Date.now()}.pcapng`),
    onPacket
} = {}) {
    return new Promise((resolve, reject) => {
        const seen = new Set();
        let buffer = '';
        let dupStream = null;
        const packets = [];

        const child = spawn(tshark, [
            '-i', iface,
            '-f', filter,
            '-w', tmpFile,
            '-P',
            '-l',
            '-T', 'fields',
            '-e', 'frame.number',
            '-e', 'udp.stream',
            '-e', 'ip.src',
            '-e', 'ip.dst',
            '-e', 'udp.payload',
            '-E', 'separator=|'
        ]);

        child.stdout.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
                const [num, stream, src, dst, payload] = line.trim().split('|');
                if (!payload) continue;
                const key = `${src}>${dst}:${payload}`;
                if (seen.has(key)) {
                    dupStream = stream;
                    child.kill();
                    return;
                }
                seen.add(key);
                const paquet = { num, stream, src, dst, payload };
                packets.push(paquet);
                if (onPacket) onPacket(paquet);
            }
        });

        child.stderr.on('data', () => {});

        child.on('error', reject);

        child.on('close', () => {
            if (dupStream === null) {
                resolve({ streamId: null, tmpFile, packets });
                return;
            }
            const yamlText = followUdpStream({ tshark, pcapPath: tmpFile, streamId: dupStream });
            resolve({ streamId: dupStream, tmpFile, packets, yamlText });
        });
    });
}

export function followUdpStream({ tshark = TSHARK_PAR_DEFAUT, pcapPath, streamId }) {
    return execFileSync(
        tshark,
        ['-r', pcapPath, '-q', '-z', `follow,udp,yaml,${streamId}`],
        { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }
    );
}

export function parseFollowYaml(yamlText) {
    const doc = load(yamlText, { schema: YAML11_SCHEMA });
    const decoder = new TextDecoder('utf-8');
    const packets = [];
    for (const packet of doc.packets || []) {
        const brut = packet.data instanceof Buffer ? packet.data : Buffer.from(packet.data || []);
        const match = decoder.decode(brut).match(/^(\d+)b'([^']+)'$/);
        if (!match) {
            packets.push({ packet: packet.packet, peer: packet.peer, index: packet.index, timestamp: packet.timestamp, prefix: null, payload: null });
            continue;
        }
        packets.push({
            packet: packet.packet,
            peer: packet.peer,
            index: packet.index,
            timestamp: packet.timestamp,
            prefix: Number(match[1]),
            payload: Buffer.from(match[2], 'base64')
        });
    }
    return { peers: doc.peers || [], packets };
}

export function summarizeStream(packets) {
    const valides = packets.filter((p) => p.prefix !== null);
    const occurrences = countOccurrences(valides.map((p) => p.prefix));
    const fil = [];
    for (const p of valides) {
        fil[p.prefix] = p.payload;
    }
    const brut = concatPayloads(fil.filter(Boolean));
    return {
        occurrences,
        rapport: formatCountReport(occurrences),
        buffers: fil,
        brut,
        image: extractPng(brut)
    };
}

export function saveStreamArtifacts({ yamlText, yamlPath, comptePath, imagePath }) {
    const parsed = parseFollowYaml(yamlText);
    const resume = summarizeStream(parsed.packets);
    if (yamlPath) fs.writeFileSync(yamlPath, yamlText);
    if (comptePath) fs.writeFileSync(comptePath, resume.rapport);
    if (imagePath) fs.writeFileSync(imagePath, resume.image);
    return { ...parsed, ...resume, yamlPath, comptePath, imagePath };
}
