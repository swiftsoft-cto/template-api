import * as net from 'net';
import { createHash } from 'node:crypto';

function ipv4Subnet(ip: string, prefix: number = 32) {
  const parts = ip.split('.');
  if (parts.length !== 4) return '0.0.0.0/32';

  // Converte IP para número
  const ipNum =
    (parseInt(parts[0]) << 24) +
    (parseInt(parts[1]) << 16) +
    (parseInt(parts[2]) << 8) +
    parseInt(parts[3]);

  // Aplica máscara de rede (robustez bitwise JS)
  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  const networkNum = ipNum & mask;

  // Converte de volta para string
  const a = (networkNum >>> 24) & 0xff;
  const b = (networkNum >>> 16) & 0xff;
  const c = (networkNum >>> 8) & 0xff;
  const d = networkNum & 0xff;

  return `${a}.${b}.${c}.${d}/${prefix}`;
}

function ipv6Subnet(ip: string, prefix: number = 64) {
  try {
    // Normaliza o IP para forma expandida
    const normalized = ip.toLowerCase().trim();

    // Trata compressão ::
    let expanded = normalized;
    if (normalized.includes('::')) {
      const parts = normalized.split('::');
      if (parts.length !== 2) {
        return '::/64'; // IP inválido
      }

      const left = parts[0].split(':').filter((p) => p.length > 0);
      const right = parts[1].split(':').filter((p) => p.length > 0);
      const missing = 8 - left.length - right.length;

      if (missing < 0) {
        return '::/64'; // IP inválido
      }

      const zeros = Array(missing).fill('0000');
      expanded = [...left, ...zeros, ...right].join(':');
    }

    // Divide em hextets
    const hextets = expanded.split(':').map((h) => h.padStart(4, '0'));

    if (hextets.length !== 8) {
      return '::/64'; // IP inválido
    }

    // Calcula quantos hextets usar baseado no prefixo
    const hextetsNeeded = Math.ceil(prefix / 16);
    const usedHextets = hextets.slice(0, hextetsNeeded);

    return `${usedHextets.join(':')}::/${prefix}`;
  } catch {
    // Fallback para IPs malformados
    return '::/64';
  }
}

export function ipToSubnet(ipRaw?: string) {
  const ip = (ipRaw || '').split(',')[0].trim(); // X-Forwarded-For safe-ish
  const fam = net.isIP(ip);

  if (fam === 4) {
    const prefix = Number(process.env.TRUST_IPV4_PREFIX) || 24; // Default mais amigável
    return ipv4Subnet(ip, prefix);
  }
  if (fam === 6) {
    const prefix = Number(process.env.TRUST_IPV6_PREFIX) || 64;
    return ipv6Subnet(ip, prefix);
  }

  return '0.0.0.0/32';
}

export function deviceHash(subnet: string, userAgent: string) {
  return createHash('sha256').update(`${subnet}|||${userAgent}`).digest('hex');
}
