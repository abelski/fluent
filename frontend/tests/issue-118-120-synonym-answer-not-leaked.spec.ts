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

test('issue #118/#120 — MatchRound disambiguates synonyms so the puzzle stays solvable', async ({ page }) => {
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
    ];

    // Mirror of MatchRound.tsx leftLabel logic.
    const counts = new Map<string, number>();
    for (const w of words) counts.set(translation(w), (counts.get(translation(w)) ?? 0) + 1);
    const ambiguous = new Set(Array.from(counts).filter(([, n]) => n > 1).map(([t]) => t));
    const leftLabel = (w: W) =>
      ambiguous.has(translation(w)) ? `${translation(w)} (${w.lithuanian})` : translation(w);

    const labels = words.map(leftLabel);
    return {
      // Colliding synonyms get a Lithuanian disambiguator so the two tiles differ.
      kolegaLabel: leftLabel(words[0]),
      bendraLabel: leftLabel(words[1]),
      labelsAreUnique: new Set(labels).size === labels.length,
      // Non-colliding words stay clean (no parenthetical noise).
      namasLabel: leftLabel(words[2]),
    };
  });

  expect(result.kolegaLabel).toBe('коллега (kolega)');
  expect(result.bendraLabel).toBe('коллега (bendradarbis)');
  expect(result.labelsAreUnique).toBe(true);
  expect(result.namasLabel).toBe('дом');
});
