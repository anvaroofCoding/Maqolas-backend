export function hasGeminiApiKey(apiKey: string | undefined | null): boolean {
  return Boolean(apiKey?.trim());
}

/** Kvota tejash uchun avval barqaror model, keyin yengil model */
export const GEMINI_GENERATION_MODELS = [
  { name: 'gemini-2.5-flash', maxOutputTokens: 65536 },
  { name: 'gemini-2.5-flash-lite', maxOutputTokens: 65536 },
] as const;

export const GEMINI_AUTOCOMPLETE_MODELS = [
  { name: 'gemini-2.5-flash-lite', maxOutputTokens: 64 },
] as const;

export type GeminiCallOptions = {
  systemInstruction?: string;
  userMessage: string;
  maxOutputTokens: number;
  json?: boolean;
  temperature?: number;
};

export type GeminiCallResult = {
  text: string | null;
  errors: string[];
};

export type GeminiChatMessage = {
  role: 'user' | 'model';
  content: string;
};

export type GeminiChatOptions = {
  systemInstruction?: string;
  messages: GeminiChatMessage[];
  maxOutputTokens: number;
  temperature?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callGeminiChat(
  apiKey: string,
  options: GeminiChatOptions,
  models: readonly { name: string; maxOutputTokens: number }[] = GEMINI_GENERATION_MODELS,
): Promise<GeminiCallResult> {
  const errors: string[] = [];
  const contents = options.messages.map((message) => ({
    role: message.role,
    parts: [{ text: message.content }],
  }));

  for (const model of models) {
    const maxOutputTokens = Math.min(options.maxOutputTokens, model.maxOutputTokens);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...(options.systemInstruction
                ? {
                    systemInstruction: {
                      parts: [{ text: options.systemInstruction }],
                    },
                  }
                : {}),
              contents,
              generationConfig: {
                temperature: options.temperature ?? 0.7,
                maxOutputTokens,
              },
            }),
          },
        );

        if (!response.ok) {
          const errorBody = await response.text();
          const message = parseGeminiApiError(response.status, errorBody);
          const entry = `${model.name}: ${message}`;
          if (!errors.includes(entry)) {
            errors.push(entry);
          }

          if (response.status === 429) {
            break;
          }

          if (response.status === 503 || response.status === 500) {
            if (attempt === 0) {
              await sleep(1800);
              continue;
            }
            break;
          }

          break;
        }

        const payload = (await response.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };

        const text =
          payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

        if (text) {
          return { text, errors };
        }

        errors.push(`${model.name}: bo'sh javob`);
        break;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'noma\'lum xatolik';
        errors.push(`${model.name}: ${message}`);
        break;
      }
    }
  }

  return { text: null, errors };
}

export async function callGeminiContent(
  apiKey: string,
  options: GeminiCallOptions,
  models: readonly { name: string; maxOutputTokens: number }[] = GEMINI_GENERATION_MODELS,
): Promise<GeminiCallResult> {
  const errors: string[] = [];

  for (const model of models) {
    const maxOutputTokens = Math.min(options.maxOutputTokens, model.maxOutputTokens);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model.name}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...(options.systemInstruction
                ? {
                    systemInstruction: {
                      parts: [{ text: options.systemInstruction }],
                    },
                  }
                : {}),
              contents: [
                { role: 'user', parts: [{ text: options.userMessage }] },
              ],
              generationConfig: {
                temperature: options.temperature ?? 0.7,
                maxOutputTokens,
                ...(options.json
                  ? { responseMimeType: 'application/json' }
                  : {}),
              },
            }),
          },
        );

        if (!response.ok) {
          const errorBody = await response.text();
          const message = parseGeminiApiError(response.status, errorBody);
          const entry = `${model.name}: ${message}`;
          if (!errors.includes(entry)) {
            errors.push(entry);
          }

          // Kvota xatolarida qayta urinish limitni tezroq tugatadi
          if (response.status === 429) {
            break;
          }

          if (response.status === 503 || response.status === 500) {
            if (attempt === 0) {
              await sleep(1800);
              continue;
            }
            break;
          }

          break;
        }

        const payload = (await response.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };

        const text =
          payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

        if (text) {
          return { text, errors };
        }

        errors.push(`${model.name}: bo'sh javob`);
        break;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'noma\'lum xatolik';
        errors.push(`${model.name}: ${message}`);
        break;
      }
    }
  }

  return { text: null, errors };
}

export function isGeminiQuotaError(errors: string[]): boolean {
  return errors.some((error) => {
    const normalized = error.toLowerCase();
    return normalized.includes('limiti') || normalized.includes('quota');
  });
}

export function pickGeminiErrorMessage(errors: string[]): string {
  const quotaError = errors.find((error) =>
    error.toLowerCase().includes('limiti'),
  );
  if (quotaError) {
    return quotaError.replace(/^[^:]+:\s*/, '');
  }

  return (
    errors[errors.length - 1]?.replace(/^[^:]+:\s*/, '') ??
    'AI xizmati javob bermadi.'
  );
}

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

    if (status === 503) {
      return 'AI xizmati hozir band. Bir necha daqiqadan keyin qayta urinib ko\'ring.';
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
