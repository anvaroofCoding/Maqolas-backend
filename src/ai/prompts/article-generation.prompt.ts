import { countWords } from '../validators/max-words.validator';

export const MAX_ARTICLE_WORDS = 5000;
export const DEFAULT_ARTICLE_WORDS = 1500;
export const MULTI_PASS_WORD_THRESHOLD = 1200;

const HTML_FORMAT_RULES = [
  '=== HTML FORMATLASH (faqat kerakli joylarda) ===',
  '- Sarlavhalar: <h1>, <h2>, <h3>',
  '- Paragraf: <p>matn</p>',
  '- Qalin: <strong>matn</strong>, kursiv: <em>matn</em>',
  '- Belgili ro\'yxat: <ul><li>element</li></ul>',
  '- Raqamli ro\'yxat: <ol><li>element</li></ol>',
  '- Iqtibos: <blockquote><p>matn</p></blockquote>',
  '- Jadval: <table><thead><tr><th>...</th></tr></thead><tbody><tr><td>...</td></tr></tbody></table>',
  '- Callout (maslahat): <div data-callout="true" data-variant="tip" class="article-callout article-callout--tip"><div class="article-callout__label" contenteditable="false">Maslahat</div><div class="article-callout__body"><p>matn</p></div></div>',
  '- Rasm: <img src="https://picsum.photos/seed/MAVZU/800/450" alt="tavsif">',
  '- Markdown sintaksisi ishlatma (**, ##, ``` va hokazo)',
].join('\n');

const CORE_WRITING_RULES = [
  '=== ASOSIY YOZISH QOIDALARI ===',
  '- TO\'G\'RIDAN-TO\'G\'RI tayyor maqola matnini yoz — nashr qilishga tayyor bo\'lsin',
  '- Mavzu, muhit, kontekst yoki so\'rov haqida UMUMIY SHARH YOZMA',
  '- "Ushbu maqolada...", "Bu mavzuda biz...", "Keling, ko\'rib chiqamiz", "So\'rovingizga ko\'ra", "qisqa sharh va amaliy yo\'riqnoma" kabi META gaplardan QAT\'IY QOCH',
  '- Foydalanuvchi bergan mavzu va talablarga MOS, chuqur va professional maqola yoz',
  '- Prompt bir nechta paragraf yoki banddan iborat bo\'lsa — HAR BIRINI qamrab ol',
  '- Raqamli talablar (1., 2., 3. ...) bo\'lsa — har bir band bajarilgan bo\'lsin',
  '- Uslub, janr, hissiyot, faktlar, struktura haqidagi ko\'rsatmalarga QAT\'IY amal qil',
  '- O\'zbek tilida, jurnalistik va ekspert darajadagi uslubda yoz',
  '- Faktlar mantiqli, misollar aniq, fikrlar izchil bo\'lsin',
  '- Umumiy shablon matn, bo\'sh gap va takrorlanish YOZMA',
].join('\n');

export function parseTargetWordCount(userPrompt: string): number {
  const patterns = [
    /kamida\s+(\d{3,5})\s*(?:ta\s+)?(?:dan\s+)?(?:ortiq\s+)?(?:qator(?:li)?\s+)?so[''`ʼ]/i,
    /(\d{3,5})\s*(?:ta\s+)?(?:qator(?:li)?\s+)?(?:dan\s+)?ortiq\s+so[''`ʼ]/i,
    /(\d{3,5})\s*(?:ta\s+)?(?:qator(?:li)?\s+)?so[''`ʼ]z/i,
    /taxminan\s+(\d{3,5})\s*(?:ta\s+)?(?:qator(?:li)?\s+)?so[''`ʼ]?z?/i,
    /hajm[:\s]+(\d{3,5})/i,
    /uzunligi[:\s]+(\d{3,5})/i,
    /(\d{3,5})\s*(?:ta\s+)?so[''`ʼ]zlik/i,
    /matn\s+hajmi[:\s]*(\d{3,5})/i,
    /(\d{4,5})\s*(?:ta\s+)?so[''`ʼ]/i,
    /maksimum?\s+(\d{3,5})/i,
    /to[''`ʼ]liq\s+(\d{3,5})/i,
  ];

  for (const pattern of patterns) {
    const match = userPrompt.match(pattern);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (!Number.isNaN(parsed)) {
        return Math.min(MAX_ARTICLE_WORDS, Math.max(500, parsed));
      }
    }
  }

  if (/\b5000\b/.test(userPrompt)) {
    return MAX_ARTICLE_WORDS;
  }

  const promptWords = countWords(userPrompt);
  if (promptWords >= 150) {
    return Math.min(MAX_ARTICLE_WORDS, 2500);
  }
  if (promptWords >= 80) {
    return 2000;
  }
  if (promptWords >= 40) {
    return 1800;
  }

  return DEFAULT_ARTICLE_WORDS;
}

export function buildArticleSystemInstruction(targetWords: number): string {
  const minWords = Math.max(400, Math.round(targetWords * 0.88));

  return [
    'Sen professional o\'zbek tilida maqola yozuvchi ekspertsan.',
    'Vazifang — foydalanuvchi bergan talab bo\'yicha TO\'LIQ va TAYYOR maqola yozish.',
    '',
    CORE_WRITING_RULES,
    '',
    '=== HAJM ===',
    `- Maqola hajmi taxminan ${targetWords} ta so'z bo'lsin`,
    `- Kamida ${minWords} ta so'z yoz (qisqa umumiy matn YOZMA)`,
    `- Maksimal hajm: ${MAX_ARTICLE_WORDS} ta so'z`,
    '',
    HTML_FORMAT_RULES,
    '',
    '=== TUZILMA ===',
    '- Birinchi element <h1> bo\'lsin (sarlavha bilan bir xil yoki yaqin)',
    '- Foydalanuvchi bergan bo\'lim nomlari va tuzilmani saqla',
    '- Kirish, asosiy bo\'limlar (h2/h3) va xulosa bo\'lsin',
    '',
    '=== JAVOB FORMATI ===',
    'Javobni FAQAT quyidagi JSON formatida qaytar, boshqa hech narsa yozma:',
    '{"title":"Maqola sarlavhasi","contentHtml":"<h1>...</h1><p>...</p>..."}',
    '- contentHtml ichidagi qo\'shtirnoqlarni JSON uchun to\'g\'ri escape qil',
  ].join('\n');
}

export function buildArticleUserMessage(userPrompt: string): string {
  return [
    'Quyidagi foydalanuvchi talabiga QAT\'IY amal qilib, shu mavzu bo\'yicha to\'liq maqola yoz.',
    'Talabdagi har bir band, uslub, hissiyot, faktlar va struktura ko\'rsatmalarini bajar.',
    '',
    '=== FOYDALANUVCHI TALABI ===',
    userPrompt,
  ].join('\n');
}

export function countWordsInHtml(html: string): number {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return countWords(text);
}

export type ArticleOutlineSection = {
  heading: string;
  level: 2 | 3;
  summary: string;
  targetWords: number;
};

export type ArticleOutline = {
  title: string;
  sections: ArticleOutlineSection[];
};

export function buildArticleGenerationPrompt(
  userPrompt: string,
  targetWords: number,
): string {
  return [
    buildArticleSystemInstruction(targetWords),
    '',
    buildArticleUserMessage(userPrompt),
  ].join('\n');
}

export function buildOutlinePrompt(
  userPrompt: string,
  targetWords: number,
): string {
  const sectionCount = Math.min(
    16,
    Math.max(6, Math.ceil(targetWords / 350)),
  );

  return [
    'Sen professional o\'zbek tilida maqola rejalashtiruvchisan.',
    'Foydalanuvchi talabiga asoslanib maqola tuzilmasini rejalashtir.',
    'Faqat reja yoz — maqola matnini yozma.',
    '',
    CORE_WRITING_RULES,
    '',
    `Maqola umumiy hajmi taxminan ${targetWords} ta so'z bo'ladi.`,
    `Rejada ${sectionCount} ta bo'lim bo'lsin (kirish va xulosa ham kiradi).`,
    'Har bir bo\'lim uchun aniq mavzu va qamrab olinadigan fikrlarni yoz.',
    'Foydalanuvchi promptidagi barcha paragraf va bandlarni bo\'limlarga taqsimla.',
    '',
    'Javobni FAQAT JSON formatida qaytar:',
    '{"title":"Sarlavha","sections":[{"heading":"Bo\'lim nomi","level":2,"summary":"Nima yoziladi","targetWords":500}]}',
    '',
    `Bo'limlardagi targetWords yig'indisi taxminan ${targetWords} ga teng bo'lsin.`,
    '',
    '=== FOYDALANUVCHI TALABI ===',
    userPrompt,
  ].join('\n');
}

export function buildSectionPrompt(
  userPrompt: string,
  articleTitle: string,
  sections: ArticleOutlineSection[],
  batchStart: number,
): string {
  const batch = sections.slice(batchStart, batchStart + 1);
  const batchWords = batch.reduce((sum, section) => sum + section.targetWords, 0);
  const sectionPlan = batch
    .map(
      (section, index) =>
        `${index + 1}. <h${section.level}>${section.heading}</h${section.level}> — ${section.summary} (≈${section.targetWords} so'z)`,
    )
    .join('\n');

  const isFirstBatch = batchStart === 0;

  return [
    'Sen professional o\'zbek tilida badiiy-publitsistik maqola yozuvchi ekspertsan.',
    'Berilgan reja bo\'yicha faqat BITTA bo\'limni yoz.',
    '',
    CORE_WRITING_RULES,
    '',
    `Maqola sarlavhasi: ${articleTitle}`,
    `Ushbu bo\'limda taxminan ${batchWords} ta so\'z yoz.`,
    '',
    '=== YOZILADIGAN BO\'LIM ===',
    sectionPlan,
    '',
    HTML_FORMAT_RULES,
    '',
    isFirstBatch
      ? '- <h1> qo\'yma — faqat berilgan bo\'limni yoz'
      : '- Oldingi bo\'limlarni takrorlama',
    '- Umumiy shablon gaplar YOZMA',
    '- Foydalanuvchi talabidagi hissiyot, faktlar, shaxslar va uslubga amal qil',
    '- Har bir paragraf mazmunli, boy va o\'qilishi oson bo\'lsin',
    '',
    'Javobni FAQAT JSON formatida qaytar:',
    '{"contentHtml":"<h2>...</h2><p>...</p>..."}',
    '',
    '=== FOYDALANUVCHI TALABI (QAT\'IY BAJARILSIN) ===',
    userPrompt,
  ].join('\n');
}

export function buildExpansionPrompt(
  userPrompt: string,
  articleTitle: string,
  existingHtml: string,
  wordsNeeded: number,
): string {
  const targetSectionWords = Math.min(1200, Math.max(400, wordsNeeded));

  return [
    'Sen professional o\'zbek tilida maqola yozuvchi ekspertsan.',
    'Mavjud maqolani DAVOM ettir — yangi bo\'limlar qo\'sh.',
    'Oldingi matnni takrorlama yoki qisqartma.',
    '',
    CORE_WRITING_RULES,
    '',
    `Maqola sarlavhasi: ${articleTitle}`,
    `Yana taxminan ${targetSectionWords} ta so'z qo'sh (umumiy maqola to'liqroq bo'lsin).`,
    '',
    HTML_FORMAT_RULES,
    '',
    'Javobni FAQAT JSON formatida qaytar:',
    '{"contentHtml":"<h2>Yangi bo\'lim</h2><p>...</p>..."}',
    '',
    '=== FOYDALANUVCHI TALABI ===',
    userPrompt,
    '',
    '=== MAVJUD MATN (TAKRORLAMA) ===',
    existingHtml.slice(-3000),
  ].join('\n');
}
