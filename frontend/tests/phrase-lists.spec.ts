import { test, expect, type Page } from '@playwright/test';

// Fake but structurally valid JWT for UI tests
function makeFakeJwt(name: string, isAdmin = false): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, is_admin: isAdmin, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setToken(page: Page, lang: 'ru' | 'en' = 'ru') {
  await page.addInitScript(({ token, lang }) => {
    localStorage.setItem('fluent_token', token);
    localStorage.setItem('cookie_consent', 'accepted');
    localStorage.setItem('fluent_lang', lang);
  }, { token: makeFakeJwt('Test User'), lang });
}

// Mock the endpoints the phrases page loads, with a configurable quota + lists.
async function mockPhrasesPage(
  page: Page,
  opts: { premium: boolean; isAdmin?: boolean; lists?: Array<{ id: number; title: string; phrase_count: number; mastered?: number; learning?: number }> },
) {
  await page.route('**/api/me/quota', (route) =>
    route.fulfill({ json: { premium_active: opts.premium, is_admin: opts.isAdmin ?? false, sessions_today: 0, daily_limit: opts.premium ? null : 5 } }),
  );
  await page.route('**/api/me/stats', (route) => route.fulfill({ json: { phrases_learned: 0, phrases_due_review: 0 } }));
  await page.route('**/api/phrase-programs', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/phrase-lists', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ json: { id: 42, title: 'Новый' } });
    }
    return route.fulfill({
      json: (opts.lists ?? []).map((l) => {
        const mastered = l.mastered ?? 0;
        const learning = l.learning ?? 0;
        return {
          id: l.id, title: l.title, difficulty: 1, phrase_count: l.phrase_count,
          created_at: '2026-07-16T00:00:00',
          stage_distribution: { stage0: l.phrase_count - mastered - learning, stage1: learning, stage2: mastered },
        };
      }),
    });
  });
}

test.describe('Мои списки (user phrase lists)', () => {
  test('non-premium user sees the Premium upsell, not the create button', async ({ page }) => {
    await setToken(page);
    await mockPhrasesPage(page, { premium: false });
    await page.goto('/dashboard/phrases/');

    const section = page.getByTestId('my-lists-section');
    await expect(section).toBeVisible();
    await expect(page.getByTestId('create-list-button')).toHaveCount(0);
    await expect(section.getByRole('link', { name: /Premium/ })).toBeVisible();
  });

  test('premium user sees the create button and can open the create dialog', async ({ page }) => {
    await setToken(page);
    await mockPhrasesPage(page, { premium: true });
    await page.goto('/dashboard/phrases/');

    const createBtn = page.getByTestId('create-list-button');
    await expect(createBtn).toBeVisible();
    await createBtn.click();
    await expect(page.getByTestId('new-list-title')).toBeVisible();

    // Filling a title enables the confirm button
    await page.getByTestId('new-list-title').fill('Путешествия');
    await expect(page.getByTestId('confirm-create-list')).toBeEnabled();
  });

  test('premium user with existing lists sees a list card with study + edit', async ({ page }) => {
    await setToken(page);
    await mockPhrasesPage(page, { premium: true, lists: [{ id: 7, title: 'Мой список', phrase_count: 5, mastered: 2, learning: 1 }] });
    await page.goto('/dashboard/phrases/');

    const card = page.getByTestId('my-list-card');
    await expect(card).toBeVisible();
    await expect(card.getByText('Мой список')).toBeVisible();
    await expect(card.getByText('5 фраз')).toBeVisible();
    // Progress bar summary like the program cards
    await expect(card.getByText('2 / 5 выучено')).toBeVisible();
    await expect(card.getByText('· 1 изучается')).toBeVisible();
    await expect(card.getByRole('link', { name: 'Учить' })).toHaveAttribute('href', /\/dashboard\/phrases\/lists\/7\/study\/?$/);
    await expect(card.getByRole('link', { name: 'Редактировать' })).toHaveAttribute('href', /\/dashboard\/phrases\/lists\/7\/edit\/?$/);
  });

  test('interface is translatable — English UI shows English labels', async ({ page }) => {
    await setToken(page, 'en');
    await mockPhrasesPage(page, { premium: true, lists: [{ id: 9, title: 'My list', phrase_count: 3 }] });
    await page.goto('/dashboard/phrases/');

    // Page chrome is localized too (was previously hardcoded Russian)
    await expect(page.getByRole('heading', { name: 'Phrases', exact: true })).toBeVisible();
    await expect(page.getByText('Learn Lithuanian phrases step by step')).toBeVisible();

    const section = page.getByTestId('my-lists-section');
    await expect(section.getByText('My lists', { exact: true })).toBeVisible();
    await expect(page.getByTestId('create-list-button')).toHaveText('+ Create list');
    const card = page.getByTestId('my-list-card');
    await expect(card.getByText('3 phrases')).toBeVisible();
    await expect(card.getByRole('link', { name: 'Study' })).toBeVisible();
    await expect(card.getByRole('link', { name: 'Edit' })).toBeVisible();
    // Difficulty badge must be localized (mock lists default to difficulty 1)
    await expect(card.getByText('Easy')).toBeVisible();
    await expect(card.getByText('Лёгкий')).toHaveCount(0);
  });

  test('lapsed premium: existing lists show greyed and locked, no study/edit', async ({ page }) => {
    await setToken(page);
    await mockPhrasesPage(page, { premium: false, lists: [{ id: 3, title: 'Старый список', phrase_count: 8 }] });
    await page.goto('/dashboard/phrases/');

    const card = page.getByTestId('my-list-card');
    await expect(card).toBeVisible();
    await expect(card.getByText('Старый список')).toBeVisible();
    // Study/Edit are gone; a Premium-locked link takes their place
    await expect(card.getByRole('link', { name: 'Учить' })).toHaveCount(0);
    await expect(card.getByRole('link', { name: 'Редактировать' })).toHaveCount(0);
    await expect(card.getByTestId('premium-locked')).toBeVisible();
    await expect(card.getByTestId('premium-locked')).toHaveAttribute('href', /\/pricing\/?$/);
    // No create button for non-eligible users
    await expect(page.getByTestId('create-list-button')).toHaveCount(0);
  });

  test('non-premium English user sees the English upsell', async ({ page }) => {
    await setToken(page, 'en');
    await mockPhrasesPage(page, { premium: false });
    await page.goto('/dashboard/phrases/');

    const section = page.getByTestId('my-lists-section');
    await expect(section.getByText('Create your own phrase lists')).toBeVisible();
    await expect(section.getByRole('link', { name: /Go Premium/ })).toBeVisible();
  });
});
