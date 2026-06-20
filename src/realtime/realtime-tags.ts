import type { RealtimeTag } from './realtime.types';

export const rtTags = {
  articleFeed: (): RealtimeTag[] => [{ type: 'Article', id: 'LIST' }],
  articleMine: (): RealtimeTag[] => [{ type: 'Article', id: 'MINE' }],
  articleSaved: (): RealtimeTag[] => [{ type: 'Article', id: 'SAVED' }],
  article: (id: string): RealtimeTag[] => [{ type: 'Article', id }],
  articleSlug: (slug: string): RealtimeTag[] => [
    { type: 'Article', id: `slug-${slug}` },
  ],
  articleEngagement: (id: string): RealtimeTag[] => [
    { type: 'Article', id: `engagement-${id}` },
  ],
  articleComments: (articleId: string): RealtimeTag[] => [
    { type: 'Comment', id: articleId },
  ],
  popularComments: (): RealtimeTag[] => [{ type: 'Comment', id: 'POPULAR' }],
  notifications: (): RealtimeTag[] => [
    { type: 'Notification', id: 'LIST' },
    { type: 'Notification', id: 'UNREAD_COUNT' },
  ],
  adminReviewQueue: (): RealtimeTag[] => [
    { type: 'Admin', id: 'REVIEW_QUEUE' },
  ],
  adminPublished: (): RealtimeTag[] => [{ type: 'Admin', id: 'PUBLISHED' }],
  adminStats: (): RealtimeTag[] => [{ type: 'Admin', id: 'STATS' }],
  adminReports: (): RealtimeTag[] => [{ type: 'Admin', id: 'REPORTS' }],
  adminUsers: (): RealtimeTag[] => [{ type: 'Admin', id: 'USERS' }],
  adminComments: (): RealtimeTag[] => [{ type: 'Admin', id: 'COMMENTS' }],
  adminArticleRequests: (): RealtimeTag[] => [
    { type: 'Admin', id: 'ARTICLE_REQUESTS' },
  ],
  articleRequestsTrending: (): RealtimeTag[] => [
    { type: 'ArticleRequest', id: 'TRENDING' },
  ],
  articleRequestsAll: (): RealtimeTag[] => [
    { type: 'ArticleRequest', id: 'ALL' },
  ],
  articleRequestsAuthor: (author: string): RealtimeTag[] => [
    { type: 'ArticleRequest', id: `author-${author}` },
  ],
  categories: (): RealtimeTag[] => [
    { type: 'Category', id: 'LIST' },
    { type: 'Category', id: 'ADMIN_LIST' },
  ],
  banners: (): RealtimeTag[] => [
    { type: 'Banner', id: 'ACTIVE' },
    { type: 'Banner', id: 'ADMIN' },
  ],
  userProfile: (username: string): RealtimeTag[] => [
    { type: 'UserProfile', id: username },
  ],
  userArticles: (username: string): RealtimeTag[] => [
    { type: 'User', id: `articles-${username}` },
  ],
  userFollowers: (username: string): RealtimeTag[] => [
    { type: 'User', id: `followers-${username}` },
  ],
  welcomePromoActive: (): RealtimeTag[] => [
    { type: 'WelcomePromo', id: 'ACTIVE' },
  ],
  welcomePromoAdmin: (): RealtimeTag[] => [
    { type: 'WelcomePromo', id: 'ADMIN' },
  ],
  welcomePromoComments: (promoId: string): RealtimeTag[] => [
    { type: 'WelcomePromoComment', id: promoId },
  ],
  welcomePromoModeration: (): RealtimeTag[] => [
    { type: 'WelcomePromoComment', id: 'MODERATION' },
  ],
  aiArticle: (): RealtimeTag[] => [
    { type: 'AiArticle', id: 'QUOTA' },
    { type: 'AiArticle', id: 'ACTIVE' },
    { type: 'AiArticle', id: 'ARCHIVE' },
  ],
  authUser: (): RealtimeTag[] => [{ type: 'AuthUser' }],
};
