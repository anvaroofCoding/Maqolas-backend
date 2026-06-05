/** Dev muhitida Google OAuth SSL (UNABLE_TO_VERIFY_LEAF_SIGNATURE) muammosini yumshatish */
export function configureDevTls() {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '1') {
    return;
  }

  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}
