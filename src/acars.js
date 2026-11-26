import dgram from 'node:dgram';

export function buildAcarsMessage(overrides = {}) {
    return {
        timestamp: Date.now() / 1000,
        station_id: 'TEST-STATION',
        freq: 131.550,
        level: -12.3,
        error: 0,
        mode: '2',
        label: 'H1',
        block_id: 'A',
        ack: '!',
        tail: '.F-TEST',
        flight: 'AF1234',
        msgno: 'M38A',
        text: 'CECI EST UN MESSAGE DE TEST',
        app: { name: 'acarsdec', ver: 'test' },
        ...overrides
    };
}

export function sendAcars(message = buildAcarsMessage(), { host = '127.0.0.1', port = 5555 } = {}) {
    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');
        const payload = Buffer.from(JSON.stringify(message));
        socket.send(payload, port, host, (err) => {
            socket.close();
            if (err) reject(err);
            else resolve({ host, port, bytes: payload.length });
        });
    });
}
