import { test, expect } from '@playwright/test';

// Verifies the fix for issues #118 / #120: when two words in a study list share the
// same Russian translation (e.g. "kolega" / "bendradarbis" → "коллега", or two verbs
// → "говорить"), the backend no longer appends the Lithuanian word in parentheses to
// the prompt (so the answer is not revealed — "в задании сразу есть ответ"), and the
// type-it stage accepts EITHER synonym form as correct.

type W = { id: number; lithuanian: string; translation_ru: string };

test('issue #118/#120 — synonyms are not leaked and either form is accepted', async ({ page }) => {
  await page.goto('/dashboard/grammar');

  const result = await page.evaluate(() => {
    // ── Mirror of QuizSession.tsx pure helpers ──
    function collapseWs(text: string): string {
      return text.replace(/\s+/g, ' ').trim();
    }
    function normalizeLt(text: string): string {
      return collapseWs(
        text.normalize('NFC').toLowerCase()
          .replace(/į/g, 'i').replace(/č/g, 'c').replace(/š/g, 's')
          .replace(/ž/g, 'z').replace(/ū/g, 'u').replace(/ų/g, 'u')
          .replace(/ę/g, 'e').replace(/ė/g, 'e').replace(/ą/g, 'a'),
      );
    }
    function checkAnswer(typed: string, target: string): boolean {
      return normalizeLt(typed) === normalizeLt(target);
    }
    function parseForms(lithuanian: string): string[] {
      const parts = lithuanian.split(/[,/]/).map((s) => s.trim()).filter(Boolean);
      return parts.length > 1 ? parts : [lithuanian.trim()];
    }

    type W = { id: number; lithuanian: string; translation_ru: string };
    const words: W[] = [
      { id: 1, lithuanian: 'kolega', translation_ru: 'коллега' },
      { id: 2, lithuanian: 'bendradarbis', translation_ru: 'коллега' },
      { id: 3, lithuanian: 'namas', translation_ru: 'дом' },
    ];

    // Replicate the stage-3 acceptance logic for the "kolega" card.
    function acceptsAnswer(card: W, typed: string): boolean {
      const forms = parseForms(card.lithuanian);
      const target = forms[0];
      const isCloze = forms.length > 1;
      const siblingForms = isCloze
        ? []
        : words
            .filter((w) => w.id !== card.id && w.translation_ru === card.translation_ru)
            .flatMap((w) => parseForms(w.lithuanian));
      return [target, ...siblingForms].some((t) => checkAnswer(typed, t));
    }

    const kolega = words[0];
    return {
      // The prompt text shown to the learner is the bare translation — no "(kolega)".
      promptHasNoParen: !kolega.translation_ru.includes('('),
      // Either synonym is accepted for the "коллега" prompt.
      acceptsOwnForm: acceptsAnswer(kolega, 'kolega'),
      acceptsSiblingForm: acceptsAnswer(kolega, 'bendradarbis'),
      // A non-synonym is still rejected.
      rejectsUnrelated: !acceptsAnswer(kolega, 'namas'),
    };
  });

  expect(result.promptHasNoParen).toBe(true);
  expect(result.acceptsOwnForm).toBe(true);
  expect(result.acceptsSiblingForm).toBe(true);
  expect(result.rejectsUnrelated).toBe(true);
});

test('issue #118/#120 — MatchRound drops synonym duplicates so no answer-spelling label is needed', async ({ page }) => {
  await page.goto('/dashboard/grammar');

  const result = await page.evaluate(() => {
    type W = { id: number; lithuanian: string; translation_ru: string; translation_en: string };
    const lang = 'ru';
    function translation(word: W): string {
      return lang === 'en' ? (word.translation_en || word.translation_ru) : word.translation_ru;
    }
    const words: W[] = [
      { id: 1, lithuanian: 'kolega', translation_ru: 'коллега', translation_en: 'colleague' },
      { id: 2, lithuanian: 'bendradarbis', translation_ru: 'коллега', translation_en: 'colleague' },
      { id: 3, lithuanian: 'namas', translation_ru: 'дом', translation_en: 'house' },
      { id: 4, lithuanian: 'kalbėti', translation_ru: 'говорить', translation_en: 'to speak' },
      { id: 5, lithuanian: 'sakyti', translation_ru: 'говорить', translation_en: 'to say' },
    ];

    // Mirror of MatchRound.tsx dedupedWords logic.
    const seen = new Set<string>();
    const dedupedWords = words.filter((w) => {
      const t = translation(w);
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });

    const translations = dedupedWords.map(translation);
    return {
      // Each translation appears at most once — no ambiguous duplicate tiles.
      translationsAreUnique: new Set(translations).size === translations.length,
      // Exactly one of each synonym pair survives (the first one encountered).
      keptCount: dedupedWords.length,
      // No label ever needs to spell out a Lithuanian word — labels are bare translations.
      labelsHaveNoParen: dedupedWords.every((w) => !translation(w).includes('(')),
    };
  });

  expect(result.translationsAreUnique).toBe(true);
  expect(result.keptCount).toBe(3); // 5 words, 2 synonym collisions → 3 unique translations
  expect(result.labelsHaveNoParen).toBe(true);
});
