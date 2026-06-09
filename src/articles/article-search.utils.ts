const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

export function escapeRegex(value: string): string {
  return value.replace(REGEX_SPECIAL_CHARS, '\\$&');
}

export function buildFuzzyRegexPattern(term: string): string {
  const escaped = escapeRegex(term.trim());

  if (!escaped) {
    return '';
  }

  if (escaped.length <= 4) {
    return escaped.split('').join('.{0,1}');
  }

  return escaped;
}

export function tokenizeSearchQuery(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2);
}

export function buildPublishedArticleSearchFilter(query: string) {
  const tokens = tokenizeSearchQuery(query);

  if (tokens.length === 0) {
    return null;
  }

  const tokenFilters = tokens.map((token) => {
    const pattern = buildFuzzyRegexPattern(token);

    return {
      $or: [
        { title: { $regex: pattern, $options: 'i' } },
        { excerpt: { $regex: pattern, $options: 'i' } },
        { contentHtml: { $regex: pattern, $options: 'i' } },
      ],
    };
  });

  return {
    status: 'published' as const,
    $and: tokenFilters,
  };
}

export function scoreArticleSearchMatch(
  article: {
    title?: string;
    excerpt?: string;
    contentHtml?: string;
  },
  query: string,
): number {
  const normalizedQuery = query.trim().toLowerCase();
  const title = (article.title ?? '').toLowerCase();
  const excerpt = (article.excerpt ?? '').toLowerCase();
  const content = (article.contentHtml ?? '').toLowerCase();
  const tokens = tokenizeSearchQuery(normalizedQuery);

  let score = 0;

  if (title.includes(normalizedQuery)) {
    score += 120;
  }

  if (excerpt.includes(normalizedQuery)) {
    score += 80;
  }

  if (content.includes(normalizedQuery)) {
    score += 40;
  }

  for (const token of tokens) {
    if (title.includes(token)) {
      score += 30;
    }

    if (excerpt.includes(token)) {
      score += 20;
    }

    if (content.includes(token)) {
      score += 10;
    }
  }

  return score;
}
