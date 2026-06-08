export const APPROVED_ARTICLE_REQUEST_FILTER = {
  moderationStatus: 'approved' as const,
};

/** Legacy requests without moderationStatus (pre-moderation). */
export const PENDING_ARTICLE_REQUEST_FILTER = {
  $or: [
    { moderationStatus: 'pending' },
    { moderationStatus: { $exists: false } },
  ],
};

export function isApprovedArticleRequest(status?: string | null) {
  return status === 'approved';
}

export function isPendingArticleRequest(status?: string | null) {
  return !status || status === 'pending';
}
