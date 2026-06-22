type ImageLayoutMeta = {
  align?: string;
  width?: string;
  inRow?: boolean;
};

function isImageNode(node: unknown): node is {
  type: string;
  attrs?: ImageLayoutMeta;
} {
  return (
    typeof node === 'object' &&
    node !== null &&
    (node as { type?: string }).type === 'image'
  );
}

export function collectImagesFromDoc(
  contentJson?: Record<string, unknown> | null,
): ImageLayoutMeta[] {
  if (!contentJson || typeof contentJson !== 'object') return [];

  const images: ImageLayoutMeta[] = [];

  function walk(nodes?: unknown[]) {
    for (const node of nodes ?? []) {
      if (!node || typeof node !== 'object') continue;

      const typed = node as {
        type?: string;
        attrs?: ImageLayoutMeta;
        content?: unknown[];
      };

      if (typed.type === 'image') {
        images.push(typed.attrs ?? {});
      } else if (typed.content?.length) {
        walk(typed.content);
      }
    }
  }

  walk(contentJson.content as unknown[] | undefined);
  return images;
}

function normalizeAlign(value?: string): 'left' | 'center' | 'right' {
  if (value === 'left' || value === 'center' || value === 'right') {
    return value;
  }
  return 'center';
}

function normalizeWidth(value?: string): string {
  if (!value) return '50';
  const parsed = Number.parseInt(String(value).replace('%', ''), 10);
  if (!Number.isFinite(parsed)) return '50';
  return String(Math.min(100, Math.max(15, parsed)));
}

function rebuildFigureHtml(figureHtml: string, meta: ImageLayoutMeta): string {
  const imgMatch = figureHtml.match(/<img\b[^>]*>/i);
  if (!imgMatch) return figureHtml;

  const align = normalizeAlign(meta.align);
  const width = normalizeWidth(meta.width);
  const inRow = Boolean(meta.inRow);

  if (inRow) {
    return `<figure class="article-figure article-figure--in-row" data-align="${align}" data-width="100" data-in-row="true" style="width: 100%">${imgMatch[0]}</figure>`;
  }

  return `<figure class="article-figure article-figure--align-${align}" data-align="${align}" data-width="${width}" style="width: ${width}%">${imgMatch[0]}</figure>`;
}

export function syncFigureLayoutInHtml(
  contentHtml: string,
  contentJson?: Record<string, unknown> | null,
): string {
  const images = collectImagesFromDoc(contentJson);
  if (images.length === 0) return contentHtml;

  let index = 0;

  return contentHtml.replace(
    /<figure\b[^>]*>[\s\S]*?<\/figure>/gi,
    (figureHtml) => {
      const meta = images[index];
      index += 1;
      if (!meta) return figureHtml;
      return rebuildFigureHtml(figureHtml, meta);
    },
  );
}
