export const FEED_RANKING = {
  LIKE_WEIGHT: 3,
  COMMENT_WEIGHT: 5,
  VIEW_WEIGHT: 0.05,
  GRAVITY: 1.3,
  VELOCITY_GRAVITY: 0.9,
  AUTHOR_FOLLOW_BOOST: 20,
  AUTHOR_ENGAGED_BOOST: 12,
  PERSONAL_WEIGHT: 0.55,
  POPULAR_WEIGHT: 0.45,
  TRENDING_VELOCITY_WEIGHT: 0.48,
  TRENDING_POPULARITY_WEIGHT: 0.52,
  INTERACTION_CATEGORY_LIKE: 3,
  INTERACTION_CATEGORY_COMMENT: 5,
  INTERACTION_CATEGORY_BOOKMARK: 4,
  INTERACTION_CATEGORY_READ: 6,
  CANDIDATE_POOL_SIZE: 400,
  HOMEPAGE_CANDIDATE_POOL: 250,
  SPOTLIGHT_PEAK_HOURS: 18,
  SPOTLIGHT_MAX_HOURS: 72,
  FRESHNESS_BOOST_HOURS: 24,
  FRESHNESS_BOOST_PER_HOUR: 0.85,
} as const;

export type UserInterestProfile = {
  categoryWeights: Record<string, number>;
  followedAuthorIds: Set<string>;
  engagedAuthorIds: Set<string>;
};

type RankableArticle = {
  likeCount?: number;
  commentCount?: number;
  viewCount?: number;
  publishedAt?: Date;
  createdAt?: Date;
  categoryIds?: Array<{ toString(): string } | string>;
  authorId?: { toString(): string } | string;
  isPinned?: boolean;
  popularityScore?: number;
};

export function articleReferenceDate(article: RankableArticle): Date {
  const reference = article.publishedAt ?? article.createdAt;
  return reference ? new Date(reference) : new Date(0);
}

export function articleAgeHours(article: RankableArticle, now = Date.now()) {
  return Math.max(
    0,
    (now - articleReferenceDate(article).getTime()) / (60 * 60 * 1000),
  );
}

export function computeEngagementRaw(article: RankableArticle) {
  return (
    (article.likeCount ?? 0) * FEED_RANKING.LIKE_WEIGHT +
    (article.commentCount ?? 0) * FEED_RANKING.COMMENT_WEIGHT +
    (article.viewCount ?? 0) * FEED_RANKING.VIEW_WEIGHT
  );
}

export function computeEngagementScore(article: RankableArticle) {
  return (
    (article.likeCount ?? 0) * FEED_RANKING.LIKE_WEIGHT +
    (article.commentCount ?? 0) * FEED_RANKING.COMMENT_WEIGHT
  );
}

export function computePopularityScore(article: RankableArticle, now = Date.now()) {
  const ageHours = articleAgeHours(article, now);
  return computeEngagementRaw(article) / Math.pow(ageHours + 2, FEED_RANKING.GRAVITY);
}

export function computeVelocityScore(article: RankableArticle, now = Date.now()) {
  const ageHours = Math.max(
    0.25,
    articleAgeHours(article, now),
  );

  const velocityEngagement =
    (article.likeCount ?? 0) * 4 +
    (article.commentCount ?? 0) * 6 +
    Math.sqrt(Math.max(0, article.viewCount ?? 0));

  return (
    velocityEngagement /
    Math.pow(ageHours + 1, FEED_RANKING.VELOCITY_GRAVITY)
  );
}

export function computeSpotlightDecayMultiplier(
  article: RankableArticle,
  now = Date.now(),
) {
  if (article.isPinned) {
    return 1;
  }

  const ageHours = articleAgeHours(article, now);

  if (ageHours <= FEED_RANKING.SPOTLIGHT_PEAK_HOURS) {
    return 1;
  }

  if (ageHours >= FEED_RANKING.SPOTLIGHT_MAX_HOURS) {
    return 0.12;
  }

  const progress =
    (ageHours - FEED_RANKING.SPOTLIGHT_PEAK_HOURS) /
    (FEED_RANKING.SPOTLIGHT_MAX_HOURS - FEED_RANKING.SPOTLIGHT_PEAK_HOURS);

  return Math.max(0.12, 1 - progress * 0.88);
}

export function computeFreshnessBoost(article: RankableArticle, now = Date.now()) {
  const ageHours = articleAgeHours(article, now);

  if (ageHours >= FEED_RANKING.FRESHNESS_BOOST_HOURS) {
    return 0;
  }

  return (
    (FEED_RANKING.FRESHNESS_BOOST_HOURS - ageHours) *
    FEED_RANKING.FRESHNESS_BOOST_PER_HOUR
  );
}

export function computePersonalScore(
  article: RankableArticle,
  profile: UserInterestProfile,
) {
  let score = 0;

  for (const categoryId of article.categoryIds ?? []) {
    const key =
      typeof categoryId === 'string' ? categoryId : categoryId.toString();
    score += profile.categoryWeights[key] ?? 0;
  }

  const authorKey =
    typeof article.authorId === 'string'
      ? article.authorId
      : article.authorId?.toString();

  if (authorKey) {
    if (profile.followedAuthorIds.has(authorKey)) {
      score += FEED_RANKING.AUTHOR_FOLLOW_BOOST;
    }
    if (profile.engagedAuthorIds.has(authorKey)) {
      score += FEED_RANKING.AUTHOR_ENGAGED_BOOST;
    }
  }

  return score;
}

export function computeTrendingScore(
  article: RankableArticle,
  profile: UserInterestProfile | null,
  mode: 'popular' | 'forYou',
  now = Date.now(),
) {
  const popularityScore =
    article.popularityScore ?? computePopularityScore(article, now);
  const velocityScore = computeVelocityScore(article, now);

  let blended =
    popularityScore * FEED_RANKING.TRENDING_POPULARITY_WEIGHT +
    velocityScore * FEED_RANKING.TRENDING_VELOCITY_WEIGHT;

  if (mode === 'forYou' && profile) {
    const personalScore = computePersonalScore(article, profile);
    blended =
      blended * FEED_RANKING.POPULAR_WEIGHT +
      personalScore * FEED_RANKING.PERSONAL_WEIGHT;
  }

  blended += computeFreshnessBoost(article, now);
  blended *= computeSpotlightDecayMultiplier(article, now);

  return blended;
}

export function computeFinalFeedScore(
  article: RankableArticle,
  profile: UserInterestProfile | null,
  mode: 'popular' | 'forYou',
  now = Date.now(),
) {
  return computeTrendingScore(article, profile, mode, now);
}

export function computeSpotlightScore(
  article: RankableArticle,
  profile: UserInterestProfile | null,
  mode: 'popular' | 'forYou',
  now = Date.now(),
) {
  return computeTrendingScore(article, profile, mode, now);
}

export function buildPopularityAggregationStages(now = new Date()) {
  return [
    {
      $addFields: {
        referenceDate: { $ifNull: ['$publishedAt', '$createdAt'] },
      },
    },
    {
      $addFields: {
        ageHours: {
          $max: [
            0,
            {
              $divide: [
                { $subtract: [now, '$referenceDate'] },
                60 * 60 * 1000,
              ],
            },
          ],
        },
        engagementRaw: {
          $add: [
            {
              $multiply: [
                { $ifNull: ['$likeCount', 0] },
                FEED_RANKING.LIKE_WEIGHT,
              ],
            },
            {
              $multiply: [
                { $ifNull: ['$commentCount', 0] },
                FEED_RANKING.COMMENT_WEIGHT,
              ],
            },
            {
              $multiply: [
                { $ifNull: ['$viewCount', 0] },
                FEED_RANKING.VIEW_WEIGHT,
              ],
            },
          ],
        },
      },
    },
    {
      $addFields: {
        popularityScore: {
          $divide: [
            '$engagementRaw',
            {
              $pow: [{ $add: ['$ageHours', 2] }, FEED_RANKING.GRAVITY],
            },
          ],
        },
      },
    },
  ];
}
