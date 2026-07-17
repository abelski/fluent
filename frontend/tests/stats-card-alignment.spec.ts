import { test, expect } from '@playwright/test';

// Verifies that the words (/dashboard/lists) and phrases (/dashboard/phrases)
// sections share an aligned experience: the same stat card layout
// (count + milestone progress + actions + due bar) and the same
// quota/premium banners, in the same page order (card → banner → title).

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

const STATS = {
  known: 723,
  streak: 3,
  mistakes: 0,
  due_review: 69,
  phrases_learned: 189,
  phrases_due_review: 188,
};

const QUOTA_PREMIUM = {
  premium_active: true,
  premium_until: '2026-07-20T00:00:00',
  sessions_today: 0,
  daily_limit: null,
};

const QUOTA_FREE = {
  premium_active: false,
  premium_until: null,
  sessions_today: 2,
  daily_limit: 10,
};

async function mockCommon(page: import('@playwright/test').Page, quota: object) {
  await page.route('**/api/me/stats', (route) => route.fulfill({ json: STATS }));
  await page.route('**/api/me/quota', (route) => route.fulfill({ json: quota }));
  await page.route('**/api/admin/settings/cefr-thresholds', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/welcome', (route) => route.fulfill({ json: { shown: true, content: null } }));
}

async function mockListsPage(page: import('@playwright/test').Page) {
  await page.route('**/api/subcategory-meta', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/lists', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/programs', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/lists-progress', (route) => route.fulfill({ json: {} }));
  await page.route('**/api/me/custom-programs', (route) => route.fulfill({ json: [] }));
}

async function mockPhrasesPage(page: import('@playwright/test').Page) {
  await page.route('**/api/phrase-programs', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/me/phrase-lists', (route) => route.fulfill({ json: [] }));
}

test.describe('Stats card alignment — words page', () => {
  test('words card shows count, CEFR milestone, actions and due bar', async ({ page }) => {
    await setFakeToken(page);
    await mockCommon(page, QUOTA_PREMIUM);
    await mockListsPage(page);

    await page.goto('/dashboard/lists');
    const card = page.getByTestId('stats-card-words');
    await expect(card).toBeVisible();
    await expect(card.getByText('723', { exact: true })).toBeVisible();
    await expect(card.getByText('≈ A1')).toBeVisible();
    await expect(card.getByText('Next', { exact: true })).toBeVisible();
    await expect(card.getByText('723 / 1000 до A2')).toBeVisible();
    await expect(card.getByRole('link', { name: 'Напомни что я мог забыть' })).toBeVisible();
    await expect(card.getByText('69 из 723 слов нужно освежить')).toBeVisible();
  });

  test('premium banner is shown on words page', async ({ page }) => {
    await setFakeToken(page);
    await mockCommon(page, QUOTA_PREMIUM);
    await mockListsPage(page);

    await page.goto('/dashboard/lists');
    await expect(page.getByTestId('premium-banner')).toBeVisible();
    await expect(page.getByText('✦ Premium')).toBeVisible();
  });
});

test.describe('Stats card alignment — phrases page', () => {
  test('phrases card shows count, milestone track, actions and due bar', async ({ page }) => {
    await setFakeToken(page);
    await mockCommon(page, QUOTA_PREMIUM);
    await mockPhrasesPage(page);

    await page.goto('/dashboard/phrases');
    const card = page.getByTestId('stats-card-phrases');
    await expect(card).toBeVisible();
    await expect(card.getByText('189', { exact: true })).toBeVisible();
    // Milestone track: 189 learned → next goal is 250
    await expect(card.getByText('Next', { exact: true })).toBeVisible();
    await expect(card.getByText('250', { exact: true })).toBeVisible();
    await expect(card.getByText('189 / 250 до следующей цели')).toBeVisible();
    await expect(card.getByRole('link', { name: 'Повторить фразы' })).toBeVisible();
    await expect(card.getByText('188 из 189 фраз нужно освежить')).toBeVisible();
  });

  test('premium banner is shown on phrases page (parity with words page)', async ({ page }) => {
    await setFakeToken(page);
    await mockCommon(page, QUOTA_PREMIUM);
    await mockPhrasesPage(page);

    await page.goto('/dashboard/phrases');
    await expect(page.getByTestId('premium-banner')).toBeVisible();
  });

  test('free-tier quota banner matches words page styling and content', async ({ page }) => {
    await setFakeToken(page);
    await mockCommon(page, QUOTA_FREE);
    await mockPhrasesPage(page);

    await page.goto('/dashboard/phrases');
    const banner = page.getByTestId('quota-banner');
    await expect(banner).toBeVisible();
    await expect(banner.getByText('2 / 10')).toBeVisible();
    await expect(banner.getByRole('link', { name: /Premium/ })).toBeVisible();
  });

  test('vocabulary pages are aligned: same filters, table layout and columns', async ({ page }) => {
    await setFakeToken(page);
    const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
    await page.route('**/api/me/known-words', (route) => route.fulfill({
      json: [
        { id: 1, lithuanian: 'namas', translation_ru: 'дом', translation_en: 'house', hint: null, last_seen: null, next_review: future(10), list_title: null, list_title_en: null, list_id: null },
        { id: 2, lithuanian: 'katė', translation_ru: 'кошка', translation_en: 'cat', hint: null, last_seen: null, next_review: future(-2), list_title: null, list_title_en: null, list_id: null },
      ],
    }));
    await page.route('**/api/me/learned-phrases', (route) => route.fulfill({
      json: [
        { id: 1, text: 'Labas rytas!', translation: 'Доброе утро!', translation_en: 'Good morning!', chapter: 1, chapter_title: 'Приветствия', program_id: 1, program_title: 'Туристические фразы', lesson_stage: 2, next_review: future(10) },
        { id: 2, text: 'Iki pasimatymo!', translation: 'До встречи!', translation_en: 'See you!', chapter: 1, chapter_title: null, program_id: 1, program_title: 'Туристические фразы', lesson_stage: 2, next_review: future(-1) },
      ],
    }));
    await page.route('**/api/admin/settings/cefr-thresholds', (route) => route.fulfill({ json: [] }));

    // Words vocabulary page
    await page.goto('/dashboard/vocabulary');
    await expect(page.getByRole('heading', { name: 'Мой словарь' })).toBeVisible();
    for (const chip of ['Все', 'Нужно повторить', 'Возможно забываю', 'Помню']) {
      await expect(page.getByRole('button', { name: new RegExp(chip) })).toBeVisible();
    }
    for (const col of ['Литовский', 'Перевод', 'Память', 'Следующее повторение']) {
      await expect(page.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
    }

    // Phrases vocabulary page — same structure
    await page.goto('/dashboard/phrases/vocabulary');
    await expect(page.getByRole('heading', { name: 'Мои фразы' })).toBeVisible();
    for (const chip of ['Все', 'Нужно повторить', 'Возможно забываю', 'Помню']) {
      await expect(page.getByRole('button', { name: new RegExp(chip) })).toBeVisible();
    }
    for (const col of ['Фраза', 'Перевод', 'Память', 'Следующее повторение']) {
      await expect(page.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
    }
    await expect(page.getByText('Labas rytas!')).toBeVisible();
    await expect(page.getByText('Туристические фразы · Приветствия')).toBeVisible();

    // Memory filter works on the phrases page
    await page.getByRole('button', { name: /Помню/ }).click();
    await expect(page.getByText('Labas rytas!')).toBeVisible();
    await expect(page.getByText('Iki pasimatymo!')).not.toBeVisible();
  });

  test('stats card is rendered above the page title (same order as words page)', async ({ page }) => {
    await setFakeToken(page);
    await mockCommon(page, QUOTA_PREMIUM);
    await mockPhrasesPage(page);

    await page.goto('/dashboard/phrases');
    const card = page.getByTestId('stats-card-phrases');
    const title = page.getByRole('heading', { name: 'Фразы', level: 1 });
    await expect(card).toBeVisible();
    await expect(title).toBeVisible();
    const cardBox = await card.boundingBox();
    const titleBox = await title.boundingBox();
    expect(cardBox && titleBox && cardBox.y < titleBox.y).toBe(true);
  });
});
