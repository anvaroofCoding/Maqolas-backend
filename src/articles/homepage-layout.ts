import {
  computeEngagementScore,
  computeSpotlightScore,
  computeVelocityScore,
  FEED_RANKING,
  type UserInterestProfile,
} from './feed-ranking';

export type HomepageSectionKey =
  | 'hero'
  | 'leftLead'
  | 'centerList'
  | 'editorChoice'
  | 'centerFill'
  | 'latest'
  | 'urgentLead'
  | 'urgentGrid'
  | 'showcase'
  | 'lowerGrid';

export type LayoutArticle = {
  _id?: { toString(): string };
  id?: string;
  isPinned?: boolean;
  coverImageUrl?: string;
  excerpt?: string;
  likeCount?: number;
  commentCount?: number;
  viewCount?: number;
  categoryIds?: Array<{ toString(): string } | string>;
  authorId?: { toString(): string } | string;
  publishedAt?: Date;
  createdAt?: Date;
};

export type ScoredLayoutArticle<T extends LayoutArticle> = {
  article: T;
  spotlightScore: number;
  velocityScore: number;
  engagementScore: number;
};

export type HomepageLayoutResult<T extends LayoutArticle> = Record<
  HomepageSectionKey,
  T[]
> & {
  hero: T[];
  editorChoice: T[];
  urgentLead: T[];
};

function getArticleId(article: LayoutArticle) {
  if (article.id) return article.id;
  return article._id?.toString() ?? '';
}

function getAuthorId(article: LayoutArticle) {
  if (!article.authorId) return null;
  return typeof article.authorId === 'string'
    ? article.authorId
    : article.authorId.toString();
}

function getCategoryIds(article: LayoutArticle) {
  return (article.categoryIds ?? []).map((categoryId) =>
    typeof categoryId === 'string' ? categoryId : categoryId.toString(),
  );
}

function hasCover(article: LayoutArticle) {
  return Boolean(article.coverImageUrl?.trim());
}

function hasExcerpt(article: LayoutArticle) {
  return Boolean(article.excerpt?.trim());
}

function isHeroEligible(article: LayoutArticle, now = Date.now()) {
  if (article.isPinned) return true;
  const reference = article.publishedAt ?? article.createdAt;
  if (!reference) return true;

  const ageHours =
    (now - new Date(reference).getTime()) / (60 * 60 * 1000);

  return ageHours <= FEED_RANKING.SPOTLIGHT_MAX_HOURS;
}

export function scoreArticlesForHomepage<T extends LayoutArticle>(
  articles: T[],
  profile: UserInterestProfile | null,
  mode: 'popular' | 'forYou',
  now = Date.now(),
): ScoredLayoutArticle<T>[] {
  return articles.map((article) => ({
    article,
    spotlightScore: computeSpotlightScore(article, profile, mode, now),
    velocityScore: computeVelocityScore(article, now),
    engagementScore: computeEngagementScore(article),
  }));
}

type PickOptions = {
  count: number;
  predicate?: (item: ScoredLayoutArticle<LayoutArticle>) => boolean;
  sortBy?: 'spotlight' | 'velocity' | 'engagement';
  diversifyAuthors?: boolean;
  diversifyCategories?: boolean;
  /** Katalog kichik bo'lsa, boshqa bo'limlarda ko'rsatilgan maqolalarni ham tanlash */
  allowReuseWhenSparse?: boolean;
  excludeIds?: Set<string>;
};

function sortScoredPool<T extends LayoutArticle>(
  pool: ScoredLayoutArticle<T>[],
  sortBy: PickOptions['sortBy'],
) {
  return [...pool].sort((a, b) => {
    const scoreFor = (item: ScoredLayoutArticle<T>) => {
      if (sortBy === 'velocity') return item.velocityScore;
      if (sortBy === 'engagement') return item.engagementScore;
      return item.spotlightScore;
    };

    const leftPinned = Boolean(a.article.isPinned);
    const rightPinned = Boolean(b.article.isPinned);
    if (leftPinned !== rightPinned) {
      return leftPinned ? -1 : 1;
    }

    const scoreDiff = scoreFor(b) - scoreFor(a);
    if (scoreDiff !== 0) return scoreDiff;

    const leftDate = a.article.publishedAt ?? a.article.createdAt ?? new Date(0);
    const rightDate = b.article.publishedAt ?? b.article.createdAt ?? new Date(0);
    return new Date(rightDate).getTime() - new Date(leftDate).getTime();
  });
}

export function buildHomepageLayout<T extends LayoutArticle>(
  ranked: ScoredLayoutArticle<T>[],
  latest: T[],
  now = Date.now(),
): HomepageLayoutResult<T> {
  const usedIds = new Set<string>();
  const usedAuthors = new Set<string>();
  const usedCategories = new Set<string>();

  const layout: HomepageLayoutResult<T> = {
    hero: [],
    leftLead: [],
    centerList: [],
    editorChoice: [],
    centerFill: [],
    latest: [],
    urgentLead: [],
    urgentGrid: [],
    showcase: [],
    lowerGrid: [],
  };

  const pickFromRanked = (options: PickOptions) => {
    const {
      count,
      predicate,
      sortBy = 'spotlight',
      diversifyAuthors = false,
      diversifyCategories = false,
      allowReuseWhenSparse = false,
      excludeIds,
    } = options;

    const picked: T[] = [];
    const pickedIds = new Set<string>();
    const sorted = sortScoredPool(ranked, sortBy);

    const isExcluded = (id: string) =>
      excludeIds?.has(id) || pickedIds.has(id);

    const markPicked = (article: T) => {
      const id = getArticleId(article);
      if (!id) return;

      picked.push(article);
      pickedIds.add(id);
      usedIds.add(id);

      const authorId = getAuthorId(article);
      if (authorId) usedAuthors.add(authorId);

      for (const categoryId of getCategoryIds(article)) {
        usedCategories.add(categoryId);
      }
    };

    for (const item of sorted) {
      if (picked.length >= count) break;

      const id = getArticleId(item.article);
      if (!id || isExcluded(id) || usedIds.has(id)) continue;
      if (predicate && !predicate(item)) continue;

      const authorId = getAuthorId(item.article);
      if (diversifyAuthors && authorId && usedAuthors.has(authorId)) {
        continue;
      }

      const categoryIds = getCategoryIds(item.article);
      if (
        diversifyCategories &&
        categoryIds.some((categoryId) => usedCategories.has(categoryId))
      ) {
        continue;
      }

      markPicked(item.article);
    }

    if (picked.length < count) {
      for (const item of sorted) {
        if (picked.length >= count) break;

        const id = getArticleId(item.article);
        if (!id || isExcluded(id) || usedIds.has(id)) continue;
        if (predicate && !predicate(item)) continue;

        markPicked(item.article);
      }
    }

    if (picked.length < count && allowReuseWhenSparse) {
      for (const item of sorted) {
        if (picked.length >= count) break;

        const id = getArticleId(item.article);
        if (!id || isExcluded(id)) continue;
        if (predicate && !predicate(item)) continue;

        picked.push(item.article);
        pickedIds.add(id);
      }
    }

    return picked;
  };

  layout.hero = pickFromRanked({
    count: 1,
    predicate: (item) => hasCover(item.article) && isHeroEligible(item.article, now),
    sortBy: 'spotlight',
    diversifyAuthors: true,
  });

  layout.leftLead = pickFromRanked({
    count: 4,
    sortBy: 'spotlight',
    predicate: (item) => hasExcerpt(item.article),
    diversifyAuthors: true,
  });

  layout.centerList = pickFromRanked({
    count: 5,
    predicate: (item) => hasCover(item.article),
    sortBy: 'velocity',
    diversifyAuthors: true,
  });

  layout.editorChoice = pickFromRanked({
    count: 1,
    sortBy: 'engagement',
    diversifyAuthors: true,
  });

  layout.centerFill = [];

  layout.urgentLead = pickFromRanked({
    count: 1,
    predicate: (item) => hasCover(item.article),
    sortBy: 'velocity',
    diversifyAuthors: true,
  });

  const urgentLeadId = layout.urgentLead[0]
    ? getArticleId(layout.urgentLead[0])
    : '';
  const urgentExcludeIds = urgentLeadId
    ? new Set<string>([urgentLeadId])
    : undefined;

  layout.urgentGrid = pickFromRanked({
    count: 4,
    predicate: (item) => hasCover(item.article),
    sortBy: 'velocity',
    diversifyCategories: true,
    allowReuseWhenSparse: true,
    excludeIds: urgentExcludeIds,
  });

  layout.showcase = pickFromRanked({
    count: 4,
    predicate: (item) => hasCover(item.article),
    sortBy: 'spotlight',
    diversifyCategories: true,
    allowReuseWhenSparse: true,
  });

  layout.lowerGrid = pickFromRanked({
    count: 2,
    sortBy: 'spotlight',
    allowReuseWhenSparse: true,
  });

  layout.latest = latest
    .map((article) => {
      const id = getArticleId(article);
      return id ? article : null;
    })
    .filter((article): article is T => article !== null)
    .slice(0, 8);

  if (layout.hero.length === 0 && ranked.length > 0) {
    const fallback = sortScoredPool(ranked, 'spotlight').find((item) => {
      const id = getArticleId(item.article);
      return id && !usedIds.has(id);
    });

    if (fallback) {
      layout.hero = [fallback.article];
      usedIds.add(getArticleId(fallback.article));
    }
  }

  return layout;
}
