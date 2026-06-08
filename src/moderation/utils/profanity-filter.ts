const BLOCKED_PATTERNS = [
  /(?:\b|_)(suka|suko|suka+)(?:\b|_)/i,
  /(?:\b|_)(blya|blyat|blat)(?:\b|_)/i,
  /(?:\b|_)(xuy|huy|hui|huj|xui)(?:\b|_)/i,
  /(?:\b|_)(pidor|pidar|pedik)(?:\b|_)/i,
  /(?:\b|_)(ebat|yebat|jebat|eban)(?:\b|_)/i,
  /(?:\b|_)(fuck|fuk|fucking|fck)(?:\b|_)/i,
  /(?:\b|_)(bitch|biatch)(?:\b|_)/i,
  /(?:\b|_)(shit|sh1t)(?:\b|_)/i,
  /(?:\b|_)(asshole|a55hole)(?:\b|_)/i,
  /(?:\b|_)(jinni|jalab|haromi|malun)(?:\b|_)/i,
];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/['`"’]/g, '')
    .replace(/[^a-z0-9\s_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function containsProfanity(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) {
    return false;
  }

  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
}
