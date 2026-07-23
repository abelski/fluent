import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Regression test for issue #147 (also covers the UX half of #107): the study
// session done screen showed "Верно 10 из 10" next to a "6 Ошибок" tile plus a
// failure-flavored message, so the user could not tell whether the lesson was
// passed. The screen must now derive every number from one outcome model
// (firstTry + stumbled + notMastered === total) and state the verdict in words.
// See plans/triage/issue-147-session-summary-contradiction.md

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const WORDS = [
  { id: 1, lithuanian: 'katė',  translation_en: 'cat', translation_ru: 'кошка', hint: null, status: 'new' },
  { id: 2, lithuanian: 'šuo',   translation_en: 'dog', translation_ru: 'собака', hint: null, status: 'new' },
];

async function setupSession(page: Page, opts: { lessonMode?: string } = {}) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
    localStorage.setItem('fluent_lang', 'ru');
  }, makeFakeJwt('Test User'));

  await page.route('**/api/me/settings', (route) =>
    route.fulfill({
      json: {
        lesson_mode: opts.lessonMode ?? 'thorough',
        use_question_timer: false,
        question_timer_seconds: 5,
      },
    }),
  );
  await page.route('**/api/lists/*/study*', (route) =>
    route.fulfill({ json: { words: WORDS, distractors: [] } }),
  );
  await page.route('**/api/words/*/progress', (route) => route.fulfill({ json: {} }));

  await page.goto('/dashboard/lists/1/study');
}

/**
 * Drive the quiz to the done screen.
 *
 * `wrongFirst` — deliberately pick a wrong MCQ option the first time each word
 * reaches stage 2, so the word ends up mastered *after* a mistake. That is the
 * exact scenario that produced the contradictory "10 of 10 / 6 errors" screen.
 */
async function playThrough(page: Page, wrongFirst: boolean) {
  const missed = new Set<string>();
  const matchHeading = page.getByRole('heading', { name: 'Соотнеси слово с переводом' });

  for (let guard = 0; guard < 80; guard++) {
    // The match round is the last step before the done screen — hand off to the
    // pairing helper below rather than treating its tiles as MCQ options.
    if (await matchHeading.isVisible().catch(() => false)) break;
    if (await page.getByTestId('result-verdict').isVisible().catch(() => false)) return;

    // Stage 1 — flashcard self-evaluation. "Легко" jumps straight to the typed
    // stage; "С трудом" routes through the multiple-choice stage, which is where
    // a mistake can be recorded. Pick whichever the scenario needs.
    const stage1 = page.getByRole('button', { name: wrongFirst ? 'С трудом' : 'Легко' });
    if (await stage1.isVisible().catch(() => false)) {
      await stage1.click();
      continue;
    }

    // Wrong-answer acknowledgment
    const dismiss = page.getByTestId('dismiss-wrong');
    if (await dismiss.isVisible().catch(() => false)) {
      await dismiss.click();
      continue;
    }

    // Stage 3 — typed answer. Always answer correctly so the word gets mastered.
    const input = page.locator('input[type="text"]').first();
    if (await input.isVisible().catch(() => false)) {
      const prompt = await page.locator('main').innerText();
      const word = WORDS.find((w) => prompt.includes(w.translation_ru));
      await input.fill(word ? word.lithuanian : '');
      await page.getByRole('button', { name: 'Проверить' }).click();
      await page.waitForTimeout(1400);
      continue;
    }

    // Stage 2 / 2r — multiple choice. Stage 2 prompts with the Lithuanian word and
    // offers translations; stage 2r is the reverse. Detect which by inspecting the
    // option texts rather than assuming.
    const options = page.locator('main button').filter({ hasNotText: /Проверить|Понятно/ });
    const count = await options.count();
    if (count > 1) {
      const texts: string[] = [];
      for (let i = 0; i < count; i++) texts.push((await options.nth(i).innerText()).trim());

      const isReverse = texts.some((t) => WORDS.some((w) => w.lithuanian === t));
      const prompt = (await page.locator('main').innerText());
      const word = isReverse
        ? WORDS.find((w) => prompt.includes(w.translation_ru))
        : WORDS.find((w) => prompt.includes(w.lithuanian));
      if (!word) { await page.waitForTimeout(200); continue; }

      const correctText = isReverse ? word.lithuanian : word.translation_ru;
      const key = String(word.id);

      if (wrongFirst && !missed.has(key)) {
        missed.add(key);
        const wrongIdx = texts.findIndex((t) => t.length > 0 && t !== correctText);
        if (wrongIdx >= 0) {
          await options.nth(wrongIdx).click();
          continue; // a "dismiss wrong" button now appears
        }
      }
      const idx = texts.indexOf(correctText);
      if (idx >= 0) await options.nth(idx).click();
      await page.waitForTimeout(1400);
      continue;
    }

    await page.waitForTimeout(200);
  }

  // Match round — left column holds the translations, right the Lithuanian words.
  for (let i = 0; i < WORDS.length; i++) {
    const left = page.getByTestId(`match-left-${i}`);
    if (!(await left.isVisible().catch(() => false))) continue;
    const label = (await left.innerText()).trim();
    const word = WORDS.find((w) => label === w.translation_ru);
    if (!word) continue;
    await left.click();
    for (let j = 0; j < WORDS.length; j++) {
      const right = page.getByTestId(`match-right-${j}`);
      if (!(await right.isVisible().catch(() => false))) continue;
      if ((await right.innerText()).trim() === word.lithuanian) {
        await right.click();
        break;
      }
    }
  }
  await page.getByTestId('match-continue').click({ timeout: 10000 });
}

test.describe('Issue #147 — session summary is internally consistent', () => {
  test('tiles reconcile with the headline total', async ({ page }) => {
    await setupSession(page);
    await playThrough(page, true);

    await expect(page.getByTestId('result-verdict')).toBeVisible({ timeout: 15000 });

    const total       = Number(await page.getByTestId('result-headline').getAttribute('data-total'));
    const firstTry    = Number(await page.getByTestId('tile-first-try').innerText());
    const stumbled    = Number(await page.getByTestId('tile-stumbled').innerText());
    const notMastered = (await page.getByTestId('tile-not-mastered').count())
      ? Number(await page.getByTestId('tile-not-mastered').innerText())
      : 0;

    // The invariant the old screen violated
    expect(firstTry + stumbled + notMastered).toBe(total);
    expect(total).toBe(WORDS.length);
  });

  test('mastering every word after mistakes still reads as passed', async ({ page }) => {
    await setupSession(page);
    await playThrough(page, true);

    const verdict = page.getByTestId('result-verdict');
    await expect(verdict).toBeVisible({ timeout: 15000 });

    // Guard against a vacuous pass: this scenario is only meaningful if the run
    // actually recorded mistakes that were later recovered from.
    expect(Number(await page.getByTestId('tile-stumbled').innerText())).toBeGreaterThan(0);

    // Every word was eventually mastered → passed, regardless of stumbles
    await expect(verdict).toHaveAttribute('data-passed', 'true');
    await expect(verdict).toHaveText('Урок пройден');
    await expect(page.getByTestId('result-emoji')).toHaveText('😊');

    // The "not mastered" tile must not render when nothing was left unlearned
    await expect(page.getByTestId('tile-not-mastered')).toHaveCount(0);

    // The discouraging nudge must NOT appear on a passed lesson — this is the
    // contradiction the user reported.
    await expect(page.getByTestId('result-message')).not.toContainText('Не страшно!');
    await expect(page.getByTestId('result-ended-early')).toHaveCount(0);
  });

  test('a clean run reports a perfect session', async ({ page }) => {
    await setupSession(page);
    await playThrough(page, false);

    await expect(page.getByTestId('result-verdict')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('result-verdict')).toHaveAttribute('data-passed', 'true');
    await expect(page.getByTestId('tile-stumbled')).toHaveText('0');
    await expect(page.getByTestId('result-message')).toContainText('Идеально');
  });
});
