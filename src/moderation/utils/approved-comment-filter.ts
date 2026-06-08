export const APPROVED_COMMENT_FILTER = { status: 'approved' as const };

/** Legacy comments without a status field (pre-moderation). */
export const PENDING_COMMENT_FILTER = {
  $or: [{ status: 'pending' }, { status: { $exists: false } }],
};

export function isApprovedCommentStatus(status?: string | null) {
  return status === 'approved';
}

export function isPendingCommentStatus(status?: string | null) {
  return !status || status === 'pending';
}
