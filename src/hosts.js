import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function getHostsPath() {
    if (os.platform() === 'win32') {
        return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32\\drivers\\etc\\hosts');
    }
    return '/etc/hosts';
}

export function addDnsRecord(ip, domain, { hostsPath = getHostsPath() } = {}) {
    const currentContent = fs.readFileSync(hostsPath, 'utf8');
    if (currentContent.includes(domain)) {
        return { added: false, hostsPath, ip, domain };
    }
    try {
        fs.appendFileSync(hostsPath, `\n${ip} ${domain}\n`, 'utf8');
    } catch (error) {
        if (error.code === 'EACCES') {
            throw new Error("Erreur de permissions : exécution en tant qu'administrateur requise.", { cause: error });
        }
        throw error;
    }
    return { added: true, hostsPath, ip, domain };
}
