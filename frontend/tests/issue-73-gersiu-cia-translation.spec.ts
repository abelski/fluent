import { test, expect } from '@playwright/test';

function makeFakeJwt(): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name: 'Test User', exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const MOCK_STUDY = {
  phrases: [
    {
      id: 382,
      text: 'Gersiu čia.',
      translation: 'Буду пить здесь.',
      translation_en: null,
      alt_texts: null,
      lesson_stage: 0,
      blank_word: 'Gersiu',
      mcq_distractors: [],
      next_review: null,
    },
    {
      id: 381,
      text: 'Gersite čia ar norėsite išsinešti?',
      translation: 'Будете пить здесь или возьмёте с собой?',
      translation_en: null,
      alt_texts: null,
      lesson_stage: 0,
      blank_word: 'Gersite',
      mcq_distractors: [],
      next_review: null,
    },
  ],
};

test.describe('Issue #73 — "gersiu/gersite" translations include the verb "пить"', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt());

    await page.route('**/api/phrase-programs/11/study**', (r) => r.fulfill({ json: MOCK_STUDY }));
    await page.route('**/api/me/quota', (r) => r.fulfill({ json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } }));
  });

  test('Gersiu čia translation contains "пить" (not just "Буду здесь")', async ({ page }) => {
    await page.goto('/dashboard/phrases/11/study');
    await page.waitForSelector('text=Gersiu', { timeout: 8000 });
    await expect(page.getByText('Буду пить здесь.').first()).toBeVisible();
    await expect(page.getByText(/^Буду здесь\.$/)).not.toBeVisible();
  });
});
