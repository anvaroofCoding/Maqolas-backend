export function normalizeGoogleAvatarUrl(url?: string): string | undefined {
  if (!url?.trim()) return undefined;

  const trimmed = url.trim();
  const isGoogle =
    trimmed.includes('googleusercontent.com') ||
    trimmed.includes('ggpht.com');

  if (!isGoogle) return trimmed;

  if (/=s\d+(-c)?/.test(trimmed)) {
    return trimmed.replace(/=s\d+(-c)?/, '=s256-c');
  }

  const separator = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${separator}s=256`;
}
