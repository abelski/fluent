import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// #10 — Premium users skip the sequential grammar lesson order.
//
// The rule itself is server-side: `is_locked` on the lesson list plus a 403 from the
// tasks endpoint for a free user who asks for a locked lesson by id. These tests cover
// the UI contract on top of that:
//   • free user  → lock icon + a "Открыть с Premium" hint linking to /pricing
//   • premium    → no lock, no hint, an out-of-order lesson starts normally
//   • 403 / 429  → a real blocked screen instead of the endless spinner the page used
//                  to show whenever the tasks fetch returned anything but 200.

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setFakeToken(page: Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt('Test User'));
}

async function mockGrammarProgramsEnrolled(page: Page) {
  await page.route('**/api/grammar-programs', async (route) => {
    await route.fulfill({
      json: [{ id: 1, title: 'Литовские падежи', title_en: null, description: null, difficulty: 1, enrolled: true }],
    });
  });
}

function lesson(id: number, level: string, isLocked: boolean) {
  return {
    id, title: 'Падежи', level, cases: [4], task_count: 2,
    rules: [], is_locked: isLocked, best_score_pct: null,
  };
}

// Same two lessons, as the backend annotates them for each kind of user.
const FREE_LESSONS = [lesson(1, 'basic', false), lesson(2, 'advanced', true)];
const PREMIUM_LESSONS = [lesson(1, 'basic', false), lesson(2, 'advanced', false)];

const TASKS = [
  { type: 'declension', prompt_lt: 'namas', prompt_ru: 'дом', case_name: 'Galininkas', number: 'vienaskaita', answer: 'namą' },
  { type: 'declension', prompt_lt: 'knyga', prompt_ru: 'книга', case_name: 'Galininkas', number: 'vienaskaita', answer: 'knygą' },
];

async function openLessonCards(page: Page, lessons: unknown[]) {
  await setFakeToken(page);
  await mockGrammarProgramsEnrolled(page);
  await page.route('**/api/grammar/lessons', async (route) => {
    await route.fulfill({ json: lessons });
  });
  await page.route(/\/api\/grammar\/verb-lessons/, async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.goto('/dashboard/grammar');
  await page.waitForSelector('[data-testid="subcategory-toggle"]', { timeout: 5000 });
  await page.locator('[data-testid="subcategory-toggle"]').first().click();
  await page.waitForSelector('.grid button', { timeout: 5000 });
}

test.describe('Grammar lesson order — free user', () => {
  test('locked lesson shows the lock icon and a /pricing upsell hint', async ({ page }) => {
    await openLessonCards(page, FREE_LESSONS);

    await expect(page.locator('[data-testid="lesson-locked"]')).toBeVisible();

    const upsell = page.locator('[data-testid="lesson-locked-upsell"]');
    await expect(upsell).toBeVisible();
    await expect(upsell).toHaveAttribute('href', /\/pricing\/?$/);
    await expect(upsell).toHaveText('Открыть с Premium');
  });

  test('unlocked lesson has no upsell hint', async ({ page }) => {
    await openLessonCards(page, [lesson(1, 'basic', false)]);
    await expect(page.locator('[data-testid="lesson-locked-upsell"]')).toHaveCount(0);
  });
});

test.describe('Grammar lesson order — premium user', () => {
  test('no lock icon and no upsell hint anywhere', async ({ page }) => {
    await openLessonCards(page, PREMIUM_LESSONS);
    await expect(page.locator('[data-testid="lesson-locked"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="lesson-locked-upsell"]')).toHaveCount(0);
  });

  test('out-of-order lesson starts normally', async ({ page }) => {
    await page.route('**/api/grammar/lessons/2/tasks', async (route) => {
      await route.fulfill({ json: TASKS });
    });
    await openLessonCards(page, PREMIUM_LESSONS);

    // Second lesson — the one a free user would still have locked.
    await page.locator('.grid button').nth(1).click();
    await expect(page.getByText('К урокам')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Grammar lesson order — blocked responses', () => {
  test('403 shows the locked screen instead of an endless spinner', async ({ page }) => {
    await page.route('**/api/grammar/lessons/1/tasks', async (route) => {
      await route.fulfill({ status: 403, json: { detail: 'Lesson is locked.' } });
    });
    await openLessonCards(page, FREE_LESSONS);

    await page.locator('.grid button').first().click();

    const blocked = page.locator('[data-testid="grammar-blocked-locked"]');
    await expect(blocked).toBeVisible({ timeout: 8000 });
    await expect(blocked.getByText('Урок закрыт')).toBeVisible();
    await expect(blocked.getByRole('link', { name: /Premium/ })).toHaveAttribute('href', /\/pricing\/?$/);
    await expect(page.locator('.animate-spin')).toHaveCount(0);
  });

  test('429 shows the daily-limit screen', async ({ page }) => {
    await page.route('**/api/grammar/lessons/1/tasks', async (route) => {
      await route.fulfill({ status: 429, json: { detail: { code: 'daily_limit_reached' } } });
    });
    await openLessonCards(page, FREE_LESSONS);

    await page.locator('.grid button').first().click();

    const blocked = page.locator('[data-testid="grammar-blocked-quota"]');
    await expect(blocked).toBeVisible({ timeout: 8000 });
    await expect(blocked.getByText('Лимит на сегодня исчерпан')).toBeVisible();
  });

  test('blocked screen can go back to the lesson list', async ({ page }) => {
    await page.route('**/api/grammar/lessons/1/tasks', async (route) => {
      await route.fulfill({ status: 403, json: { detail: 'Lesson is locked.' } });
    });
    await openLessonCards(page, FREE_LESSONS);

    await page.locator('.grid button').first().click();
    await expect(page.locator('[data-testid="grammar-blocked-locked"]')).toBeVisible({ timeout: 8000 });

    await page.getByRole('button', { name: /К урокам/ }).click();
    await expect(page.locator('[data-testid="category-toggle-program-1"]')).toBeVisible();
  });
});
