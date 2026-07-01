const HASHTAG_PATTERN = /^[\p{L}\p{N}_]+$/u;
const MAX_HASHTAGS = 10;
const MAX_HASHTAG_LENGTH = 50;

export function normalizeHashtag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, '').toLowerCase();
  if (!tag || tag.length > MAX_HASHTAG_LENGTH) return null;
  if (!HASHTAG_PATTERN.test(tag)) return null;
  return tag;
}

export function normalizeHashtags(raw?: string[] | null): string[] {
  if (!raw?.length) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of raw) {
    const tag = normalizeHashtag(item);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
    if (result.length >= MAX_HASHTAGS) break;
  }

  return result;
}
