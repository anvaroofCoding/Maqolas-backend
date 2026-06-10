export function hasGeminiApiKey(apiKey: string | undefined | null): boolean {
  return Boolean(apiKey?.trim());
}

/** Faqat hozirgi kalit va kvota bilan ishlaydigan modellar */
export const GEMINI_GENERATION_MODELS = [
  { name: 'gemini-2.5-flash', maxOutputTokens: 65536 },
  { name: 'gemini-2.5-flash-lite', maxOutputTokens: 65536 },
] as const;

const TEMPLATE_GARBAGE_MARKERS = [
  'qisqa sharh va amaliy yo\'riqnoma',
  'zamonaviy jamiyatda katta ahamiyatga ega',
  'asosiy tushunchalar, amaliy maslahatlar va foydali xulosalar',
  'bilim — eng katta boylik',
  'asosiy tushunchalarni tushunish',
  'amaliy qadamlarni qo\'llash',
  'keyingi qadamni rejalashtirish',
  'mavzuni chuqurroq o\'rganish orqali ko\'p hollarda',
  'har bir bo\'limni amalda sinab ko\'ring',
  'bo\'lim: asosiy jihatlar',
];

export function isTemplateGarbage(contentHtml: string): boolean {
  const normalized = contentHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

  let hits = 0;
  for (const marker of TEMPLATE_GARBAGE_MARKERS) {
    if (normalized.includes(marker)) {
      hits += 1;
    }
  }

  return hits >= 2;
}

export function parseGeminiApiError(status: number, body: string): string {
  try {
    const payload = JSON.parse(body) as {
      error?: { message?: string; code?: number };
    };
    const message = payload.error?.message ?? '';

    if (status === 429 || message.toLowerCase().includes('quota')) {
      return 'Gemini API limiti tugagan. Biroz kutib qayta urinib ko\'ring yoki Google AI Studio da kvotani tekshiring.';
    }

    if (status === 401 || status === 403 || message.toLowerCase().includes('api key')) {
      return 'GEMINI_API_KEY noto\'g\'ri. Google AI Studio (aistudio.google.com) dan yangi kalit oling.';
    }

    if (message) {
      return `AI xizmati javob bermadi: ${message.slice(0, 180)}`;
    }
  } catch {
    // ignore JSON parse errors
  }

  return `AI xizmati javob bermadi (HTTP ${status}).`;
}

export function cleanGeminiJsonResponse(raw: string): string {
  return raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export function parseArticleGenerationPayload(
  raw: string,
): { title: string; contentHtml: string } | null {
  const cleaned = cleanGeminiJsonResponse(raw);

  try {
    const data = JSON.parse(cleaned) as {
      title?: string;
      contentHtml?: string;
    };

    const title = data.title?.trim();
    const contentHtml = data.contentHtml?.trim();

    if (!title || !contentHtml || contentHtml.length < 100) {
      return null;
    }

    if (isTemplateGarbage(contentHtml)) {
      return null;
    }

    return { title, contentHtml };
  } catch {
    const extracted = extractArticleJsonFields(cleaned);
    if (!extracted || isTemplateGarbage(extracted.contentHtml)) {
      return null;
    }
    return extracted;
  }
}

export function parseSectionGenerationPayload(raw: string): string | null {
  const cleaned = cleanGeminiJsonResponse(raw);

  try {
    const data = JSON.parse(cleaned) as { contentHtml?: string };
    const contentHtml = data.contentHtml?.trim();
    if (!contentHtml || contentHtml.length < 40 || isTemplateGarbage(contentHtml)) {
      return null;
    }
    return contentHtml;
  } catch {
    const match = /"contentHtml"\s*:\s*"((?:[^"\\]|\\.)*)"/s.exec(cleaned);
    if (!match?.[1]) return null;
    const contentHtml = unescapeJsonString(match[1]).trim();
    if (!contentHtml || isTemplateGarbage(contentHtml)) {
      return null;
    }
    return contentHtml;
  }
}

function extractArticleJsonFields(
  cleaned: string,
): { title: string; contentHtml: string } | null {
  const titleMatch = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/s.exec(cleaned);
  const htmlMatch = /"contentHtml"\s*:\s*"((?:[^"\\]|\\.)*)"/s.exec(cleaned);

  if (!titleMatch?.[1] || !htmlMatch?.[1]) {
    return null;
  }

  const title = unescapeJsonString(titleMatch[1]).trim();
  const contentHtml = unescapeJsonString(htmlMatch[1]).trim();

  if (!title || contentHtml.length < 100) {
    return null;
  }

  return { title, contentHtml };
}

function unescapeJsonString(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}
