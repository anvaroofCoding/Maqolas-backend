export const FEED_RANKING = {
  LIKE_WEIGHT: 3,
  COMMENT_WEIGHT: 5,
  VIEW_WEIGHT: 0.05,
  GRAVITY: 1.3,
  AUTHOR_FOLLOW_BOOST: 20,
  AUTHOR_ENGAGED_BOOST: 12,
  PERSONAL_WEIGHT: 0.55,
  POPULAR_WEIGHT: 0.45,
  INTERACTION_CATEGORY_LIKE: 3,
  INTERACTION_CATEGORY_COMMENT: 5,
  INTERACTION_CATEGORY_BOOKMARK: 4,
  CANDIDATE_POOL_SIZE: 400,
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

export function computePopularityScore(article: RankableArticle, now = Date.now()) {
  const ageHours = Math.max(
    0,
    (now - articleReferenceDate(article).getTime()) / (60 * 60 * 1000),
  );

  const engagementRaw =
    (article.likeCount ?? 0) * FEED_RANKING.LIKE_WEIGHT +
    (article.commentCount ?? 0) * FEED_RANKING.COMMENT_WEIGHT +
    (article.viewCount ?? 0) * FEED_RANKING.VIEW_WEIGHT;

  return engagementRaw / Math.pow(ageHours + 2, FEED_RANKING.GRAVITY);
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

export function computeFinalFeedScore(
  article: RankableArticle,
  profile: UserInterestProfile | null,
  mode: 'popular' | 'forYou',
  now = Date.now(),
) {
  const popularityScore =
    article.popularityScore ?? computePopularityScore(article, now);

  if (mode !== 'forYou' || !profile) {
    return popularityScore;
  }

  const personalScore = computePersonalScore(article, profile);

  return (
    popularityScore * FEED_RANKING.POPULAR_WEIGHT +
    personalScore * FEED_RANKING.PERSONAL_WEIGHT
  );
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
