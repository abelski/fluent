import { test, expect } from '@playwright/test';

// Phrase star-difficulty feature: each custom phrase has a star level (1-3,
// auto-assigned from word count, user-overridable on the edit page), and study
// sessions filter phrases by star level like word lists do — mastering a level
// offers advancing to the next one.

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setFakeToken(page: import('@playwright/test').Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Test User'));
}

const LIST_DETAIL = {
  id: 2,
  title: 'Test list',
  difficulty: 1,
  phrases: [
    { id: 1, text: 'Labas rytas', translation: 'Доброе утро', translation_en: null, position: 0, star: 1, lesson_stage: 0 },
    { id: 2, text: 'Aš noriu juodos kavos', translation: 'Я хочу кофе', translation_en: null, position: 1, star: 2, lesson_stage: 0 },
  ],
};

test.describe('Phrase stars — edit page', () => {
  test('shows per-phrase stars and no list difficulty selector; clicking a star saves it', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/me/phrase-lists/2', async (route) => {
      await route.fulfill({ json: LIST_DETAIL });
    });
    let putBody: { star?: number } | null = null;
    await page.route('**/api/me/phrase-lists/phrases/1', async (route) => {
      putBody = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({ json: { ok: true } });
    });

    await page.goto('/dashboard/phrases/lists/2/edit');
    await expect(page.getByTestId('phrase-list-edit-page')).toBeVisible({ timeout: 5000 });

    // Old list-level difficulty selector is gone
    await expect(page.getByRole('button', { name: 'Легко' })).toHaveCount(0);

    // Each phrase row has a star widget
    await expect(page.getByTestId('phrase-star')).toHaveCount(2);

    // Click 3rd star on the first phrase → PUT with star: 3
    await page.getByTestId('phrase-star').first().getByRole('button').nth(2).click();
    await expect.poll(() => putBody?.star).toBe(3);
  });
});

test.describe('Phrase stars — study level flow', () => {
  test('level complete screen appears and advancing reloads the next level', async ({ page }) => {
    await setFakeToken(page);
    const requestedLevels: string[] = [];
    await page.route('**/api/me/phrase-lists/2/study*', async (route) => {
      const url = new URL(route.request().url());
      const level = url.searchParams.get('star_level') ?? '1';
      requestedLevels.push(level);
      if (level === '1') {
        await route.fulfill({ json: { phrases: [], all_known: true } });
      } else {
        await route.fulfill({
          json: {
            phrases: [{
              id: 2, text: 'Aš noriu juodos kavos', translation: 'Я хочу кофе', translation_en: null,
              alt_texts: null, lesson_stage: 0, blank_word: 'noriu', mcq_distractors: ['a', 'b', 'c'],
              word_tiles: ['kavos', 'Aš', 'noriu', 'juodos'], next_review: null,
            }],
          },
        });
      }
    });

    await page.goto('/dashboard/phrases/lists/2/study');

    // Default level 1 is fully mastered → trophy screen with ★ and advance button
    await expect(page.getByTestId('phrase-level-complete')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('★');

    // Advance to ★★ — reloads the session at level 2 with the unlearned phrase
    await page.getByTestId('advance-level-btn').click();
    await expect(page.getByTestId('phrase-session-stage0')).toBeVisible({ timeout: 5000 });
    expect(requestedLevels).toContain('2');
  });
});
