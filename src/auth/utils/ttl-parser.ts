/**
 * Parser de TTL que suporta diferentes unidades de tempo
 * Exemplos: "15m", "2h", "7d", "30s", "5000ms"
 */
export function parseTTL(ttl: string): number {
  const match = ttl.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    throw new Error(
      `Invalid TTL format: ${ttl}. Expected format: <number><unit> (e.g., "15m", "2h", "7d")`,
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown TTL unit: ${unit}`);
  }
}

/**
 * Converte TTL em milissegundos para adicionar à data atual
 */
export function addTTLToDate(ttl: string): Date {
  const ms = parseTTL(ttl);
  return new Date(Date.now() + ms);
}
