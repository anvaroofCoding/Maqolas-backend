export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractExcerpt(html: string, maxLength = 240): string {
  const text = stripHtml(html);
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}…`;
}

export function extractExcerptWords(html: string, maxWords = 40): string {
  const text = stripHtml(html);
  if (!text) return '';

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;

  return `${words.slice(0, maxWords).join(' ')}…`;
}

export function extractCoverImage(html: string): string | undefined {
  return extractImageUrls(html)[0];
}

function sanitizeImageUrl(url: string): string {
  return url
    .replace(/&amp;/gi, '&')
    .replace(/&#0*38;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .trim();
}

export function extractImageUrls(html: string): string[] {
  const matches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  const urls: string[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    const src = sanitizeImageUrl(match[1] ?? '');
    if (!src || seen.has(src)) continue;
    seen.add(src);
    urls.push(src);
  }

  return urls;
}

export const MIN_SUBMIT_WORDS = 200;

export function countWordsInHtml(html: string): number {
  const text = stripHtml(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function hasImageInHtml(html: string): boolean {
  return extractImageUrls(html).length > 0;
}
