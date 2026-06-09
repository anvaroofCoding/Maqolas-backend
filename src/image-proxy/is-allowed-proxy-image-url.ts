const PRIVATE_IPV4 =
  /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[0-1])\.)/;

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  if (
    normalized === 'localhost' ||
    normalized === '0.0.0.0' ||
    normalized === '::1' ||
    normalized.endsWith('.local') ||
    normalized === 'metadata.google.internal'
  ) {
    return true;
  }

  return PRIVATE_IPV4.test(normalized);
}

export function isAllowedProxyImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    return !isPrivateHostname(parsed.hostname);
  } catch {
    return false;
  }
}
