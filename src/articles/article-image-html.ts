export function optimizeArticleImagesHtml(contentHtml: string): string {
  if (!contentHtml) return contentHtml;

  return contentHtml.replace(/<img\b([^>]*)\/?>/gi, (match, attrs: string) => {
    let nextAttrs = attrs;

    if (!/\bloading=/i.test(nextAttrs)) {
      nextAttrs += ' loading="lazy"';
    }
    if (!/\bdecoding=/i.test(nextAttrs)) {
      nextAttrs += ' decoding="async"';
    }
    if (!/\balt=/i.test(nextAttrs)) {
      nextAttrs += ' alt=""';
    }

    const trimmed = nextAttrs.trim();
    return trimmed.endsWith('/')
      ? `<img ${trimmed.slice(0, -1).trim()} />`
      : `<img ${trimmed}>`;
  });
}
