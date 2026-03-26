import { test, expect } from '@playwright/test';

function makeFakeJwt(email: string, name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email, name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

async function setToken(page: import('@playwright/test').Page, email = 'test@test.com', name = 'Test User') {
  await page.addInitScript((token) => {
    localStorage.setItem('fluent_token', token);
  }, makeFakeJwt(email, name));
}

// ── Pricing page ────────────────────────────────────────────────────────────

test.describe('Pricing page', () => {
  test('loads and shows free and premium plans', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText('Бесплатно', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Простые и честные/ })).toBeVisible();
  });

  test('shows mission statement text', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/не ради заработка/)).toBeVisible();
  });

  test('shows back to lists link', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('link', { name: /Вернуться к словарям/ })).toBeVisible();
  });

  test('free plan shows 10 sessions per day', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/10 учебных сессий в день/)).toBeVisible();
  });

  test('premium plan shows unlimited sessions', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByText(/Неограниченное количество сессий/)).toBeVisible();
  });
});

// ── Quota banner on lists page ──────────────────────────────────────────────

test.describe('Quota banner', () => {
  test('shows session counter for basic user', async ({ page }) => {
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({
        json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 3, daily_limit: 10, is_admin: false },
      });
    });
    await page.route('**/api/me/lists-progress', async (route) => {
      await route.fulfill({ json: {} });
    });
    await setToken(page);
    await page.goto('/dashboard/lists');
    await expect(page.getByText(/Сессий сегодня/)).toBeVisible();
    await expect(page.getByText(/3 \/ 10/)).toBeVisible();
  });

  test('shows limit reached banner when sessions exhausted', async ({ page }) => {
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({
        json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 10, daily_limit: 10, is_admin: false },
      });
    });
    await page.route('**/api/me/lists-progress', async (route) => {
      await route.fulfill({ json: {} });
    });
    await setToken(page);
    await page.goto('/dashboard/lists');
    await expect(page.getByText(/Лимит на сегодня исчерпан/)).toBeVisible();
  });

  test('study button is disabled when limit reached', async ({ page }) => {
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({
        json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 10, daily_limit: 10, is_admin: false },
      });
    });
    await page.route('**/api/me/lists-progress', async (route) => {
      await route.fulfill({ json: {} });
    });
    await setToken(page);
    await page.goto('/dashboard/lists');
    // Wait for lists to load
    await page.waitForSelector('.grid', { timeout: 5000 });
    const studyBtn = page.locator('button:has-text("Учить")').first();
    await expect(studyBtn).toBeDisabled();
  });

  test('no quota banner shown for premium user', async ({ page }) => {
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({
        json: { is_premium: true, premium_active: true, premium_until: null, sessions_today: 5, daily_limit: null, is_admin: false },
      });
    });
    await page.route('**/api/me/lists-progress', async (route) => {
      await route.fulfill({ json: {} });
    });
    await setToken(page);
    await page.goto('/dashboard/lists');
    await expect(page.getByText(/Сессий сегодня/)).not.toBeVisible();
    await expect(page.getByText(/Лимит на сегодня исчерпан/)).not.toBeVisible();
  });

  test('premium badge shown with expiry date', async ({ page }) => {
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({
        json: { is_premium: true, premium_active: true, premium_until: '2026-12-01T00:00:00', sessions_today: 0, daily_limit: null, is_admin: false },
      });
    });
    await page.route('**/api/me/lists-progress', async (route) => {
      await route.fulfill({ json: {} });
    });
    await setToken(page);
    await page.goto('/dashboard/lists');
    await expect(page.getByText('✦ Premium')).toBeVisible();
  });
});

// ── Study page 429 limit screen ─────────────────────────────────────────────

test.describe('Study page limit reached', () => {
  test('shows limit screen when API returns 429', async ({ page }) => {
    await page.route('**/api/lists/*/study**', async (route) => {
      await route.fulfill({ status: 429, json: { detail: { code: 'daily_limit_reached', limit: 10, sessions_today: 10 } } });
    });
    await setToken(page);
    await page.goto('/dashboard/lists/_/study');
    await expect(page.getByText('Лимит на сегодня исчерпан')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('link', { name: 'Получить Premium' })).toBeVisible();
  });

  test('limit screen has link to pricing page', async ({ page }) => {
    await page.route('**/api/lists/*/study**', async (route) => {
      await route.fulfill({ status: 429, json: { detail: { code: 'daily_limit_reached', limit: 10, sessions_today: 10 } } });
    });
    await setToken(page);
    await page.goto('/dashboard/lists/_/study');
    const link = page.getByRole('link', { name: 'Получить Premium' });
    await expect(link).toBeVisible({ timeout: 5000 });
    await expect(link).toHaveAttribute('href', /\/pricing/);
  });
});

// ── Admin nav link ───────────────────────────────────────────────────────────

test.describe('Admin dropdown link', () => {
  test('admin link not visible for regular user', async ({ page }) => {
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({
        json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: false },
      });
    });
    await page.route('**/api/me/lists-progress', async (route) => {
      await route.fulfill({ json: {} });
    });
    await setToken(page);
    await page.goto('/dashboard/lists');
    // Open user dropdown
    await page.locator('header button').filter({ hasText: /Test User|^[A-Z]$/ }).first().click();
    await expect(page.getByRole('link', { name: 'Администрирование' })).not.toBeVisible();
  });

  test('admin link visible in dropdown for admin user', async ({ page }) => {
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({
        json: { is_premium: false, premium_active: false, premium_until: null, sessions_today: 0, daily_limit: 10, is_admin: true },
      });
    });
    await page.route('**/api/me/lists-progress', async (route) => {
      await route.fulfill({ json: {} });
    });
    await setToken(page);
    await page.goto('/dashboard/lists');
    // Open user dropdown
    await page.locator('header button').filter({ hasText: /Test User|^[A-Z]$/ }).first().click();
    await expect(page.getByRole('link', { name: 'Администрирование' })).toBeVisible();
  });
});

// ── Admin panel page ─────────────────────────────────────────────────────────

test.describe('Admin panel', () => {
  const MOCK_USERS = [
    { id: '1', email: 'artyrbelski@gmail.com', name: 'Artur', is_premium: false, premium_until: null, premium_active: false, is_admin: true, sessions_today: 2, daily_limit: 10 },
    { id: '2', email: 'user@example.com', name: 'User One', is_premium: false, premium_until: null, premium_active: false, is_admin: false, sessions_today: 5, daily_limit: 10 },
  ];

  test('renders user table with names and tiers', async ({ page }) => {
    await page.route('**/api/admin/users', async (route) => {
      await route.fulfill({ json: MOCK_USERS });
    });
    await setToken(page, 'artyrbelski@gmail.com', 'Artur');
    await page.goto('/dashboard/admin');
    await expect(page.getByRole('table').getByText('Artur')).toBeVisible();
    await expect(page.getByRole('table').getByText('User One')).toBeVisible();
    await expect(page.getByText('Админ', { exact: true })).toBeVisible();
    await expect(page.getByText('Basic', { exact: true })).toBeVisible();
  });

  test('non-admin is redirected away from admin page', async ({ page }) => {
    await page.route('**/api/admin/users', async (route) => {
      await route.fulfill({ status: 403, json: { detail: 'Forbidden' } });
    });
    await setToken(page);
    await page.goto('/dashboard/admin');
    await expect(page).toHaveURL(/\/dashboard\/lists/, { timeout: 5000 });
  });
});
