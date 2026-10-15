import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

export function isPrivateIP(ip: string): boolean {
  // Check IPv4
  if (ip.includes('.')) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return true; // invalid = unsafe

    const [a, b, c, d] = parts;

    // RFC 1918 (Private IP spaces)
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;

    // Loopback
    if (a === 127) return true;

    // Link-local
    if (a === 169 && b === 254) return true;

    // Unspecified / Broadcast / Multicast
    if (a === 0 || a >= 224) return true;

    return false;
  }

  // Check IPv6
  if (ip.includes(':')) {
    const normalized = ip.toLowerCase();
    
    // Loopback
    if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true;

    // Unspecified
    if (normalized === '::' || normalized === '0:0:0:0:0:0:0:0') return true;

    // Link-local (fe80::/10)
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
      return true;
    }

    // Unique Local Address (fc00::/7 - private local)
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
      return true;
    }

    // Multicast (ff00::/8)
    if (normalized.startsWith('ff')) {
      return true;
    }

    return false;
  }

  return true; // Unknown IP format is treated as unsafe
}

export function normalizeUrl(rawUrl: string): string {
  let trimmed = (rawUrl || '').trim();
  if (!trimmed) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }
  return trimmed;
}

export async function verifyUrlSafety(urlString: string): Promise<{ safe: boolean; url?: URL; normalizedUrl?: string; error?: string }> {
  try {
    const normalized = normalizeUrl(urlString);
    const url = new URL(normalized);

    // Validate scheme
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { safe: false, error: `Invalid protocol: ${url.protocol}. Only http: and https: are allowed.` };
    }

    const hostname = url.hostname;

    // Check if hostname is empty or looks like localhost
    if (!hostname || hostname.toLowerCase() === 'localhost') {
      return { safe: false, error: 'Access to localhost is prohibited.' };
    }

    // Attempt to resolve IP address
    let resolvedIp: string;
    try {
      const lookupResult = await dnsLookup(hostname);
      resolvedIp = lookupResult.address;
    } catch (err: any) {
      return { safe: false, error: `DNS resolution failed for hostname: ${hostname}` };
    }

    // Verify resolved IP safety
    if (isPrivateIP(resolvedIp)) {
      return { safe: false, error: `Access to private or local IP address (${resolvedIp}) is prohibited.` };
    }

    return { safe: true, url, normalizedUrl: url.toString() };
  } catch (err: any) {
    return { safe: false, error: `Malformed URL: ${err.message}` };
  }
}

/**
 * Normalizes a URL string or hostname into a clean lowercase hostname without 'www.' prefix.
 */
export function normalizeDomainHost(urlOrHost: string): string | null {
  if (!urlOrHost || typeof urlOrHost !== 'string') return null;
  let raw = urlOrHost.trim().toLowerCase();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw}`;
  }
  try {
    const parsed = new URL(raw);
    let host = parsed.hostname.toLowerCase().trim();
    if (host.startsWith('www.')) {
      host = host.slice(4);
    }
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Robustly checks if candidate URL or hostname matches the target domain or is a valid subdomain.
 * Prevents lookalike domains (e.g., 'competitor-brand.com' vs 'brand.com') and attacker suffix
 * domains (e.g., 'brand.com.attacker.org') from matching.
 */
export function isSameDomainOrSubdomain(candidateUrlOrHost: string, targetUrlOrHost: string): boolean {
  const candidateHost = normalizeDomainHost(candidateUrlOrHost);
  const targetHost = normalizeDomainHost(targetUrlOrHost);
  if (!candidateHost || !targetHost) return false;

  // Exact domain match (ignoring www)
  if (candidateHost === targetHost) return true;

  // Valid subdomain boundary match (e.g., 'blog.brand.com' matches 'brand.com')
  if (candidateHost.endsWith(`.${targetHost}`)) {
    return true;
  }

  return false;
}
