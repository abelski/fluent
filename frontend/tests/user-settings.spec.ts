import { test, expect } from '@playwright/test';

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

const DEFAULT_SETTINGS = { words_per_session: 10, new_words_ratio: 0.7, lesson_mode: 'thorough', use_question_timer: false, question_timer_seconds: 5 };

test.describe('User settings page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('Test User'));
    await page.route('**/api/me/settings', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: DEFAULT_SETTINGS });
      } else {
        const body = JSON.parse(route.request().postData() ?? '{}');
        await route.fulfill({ json: body });
      }
    });
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({ json: { is_premium: false, premium_active: false, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } });
    });
  });

  test('settings page loads with default values', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page.locator('[data-testid="session-size-value"]')).toHaveText('10');
    await expect(page.locator('[data-testid="ratio-slider"]')).toHaveValue('70');
  });

  test('tabs render and non-vocabulary tabs show placeholder', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForSelector('[data-testid="settings-tabs"]');

    for (const tab of ['grammar', 'practice', 'other']) {
      await page.locator(`[data-testid="tab-${tab}"]`).click();
      await expect(page.locator('[data-testid="session-size-slider"]')).not.toBeVisible();
    }

    await page.locator('[data-testid="tab-vocabulary"]').click();
    await expect(page.locator('[data-testid="session-size-slider"]')).toBeVisible();
  });

  test('save button updates settings and shows confirmation', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForSelector('[data-testid="session-size-slider"]');

    await page.locator('[data-testid="session-size-slider"]').fill('15');
    await page.locator('[data-testid="ratio-slider"]').fill('50');
    await page.locator('[data-testid="save-settings-btn"]').click();

    await expect(page.locator('[data-testid="saved-message"]')).toBeVisible({ timeout: 3000 });
  });

  test('settings page is reachable from /dashboard/settings', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page.locator('[data-testid="session-size-slider"]')).toBeVisible({ timeout: 5000 });
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('fluent_token');
    });
    await page.goto('/dashboard/settings');
    await expect(page).toHaveURL(/\/login/, { timeout: 5000 });
  });

  test('lesson mode slider renders and toggles between thorough and quick', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForSelector('[data-testid="lesson-mode-slider"]');

    const slider = page.locator('[data-testid="lesson-mode-slider"]');
    await expect(slider).toHaveValue('1'); // thorough = position 1

    await slider.fill('2');
    await expect(slider).toHaveValue('2'); // quick = position 2
  });

  test('timer checkbox renders and toggles; slider appears only when checked', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await page.waitForSelector('[data-testid="timer-checkbox"]');

    const checkbox = page.locator('[data-testid="timer-checkbox"]');
    await expect(checkbox).not.toBeChecked();
    await expect(page.locator('[data-testid="timer-seconds-control"]')).not.toBeVisible();

    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await expect(page.locator('[data-testid="timer-seconds-control"]')).toBeVisible();

    await checkbox.uncheck();
    await expect(page.locator('[data-testid="timer-seconds-control"]')).not.toBeVisible();
  });

  test('save button sends lesson_mode, use_question_timer and question_timer_seconds', async ({ page }) => {
    let savedBody: Record<string, unknown> = {};
    await page.route('**/api/me/settings', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: DEFAULT_SETTINGS });
      } else {
        savedBody = JSON.parse(route.request().postData() ?? '{}');
        await route.fulfill({ json: savedBody });
      }
    });

    await page.goto('/dashboard/settings');
    await page.waitForSelector('[data-testid="lesson-mode-slider"]');

    await page.locator('[data-testid="lesson-mode-slider"]').fill('2'); // switch to quick
    await page.locator('[data-testid="timer-checkbox"]').check();
    await page.locator('[data-testid="timer-seconds-slider"]').fill('15');
    await page.locator('[data-testid="save-settings-btn"]').click();

    await expect(page.locator('[data-testid="saved-message"]')).toBeVisible({ timeout: 3000 });
    expect(savedBody.lesson_mode).toBe('quick');
    expect(savedBody.use_question_timer).toBe(true);
    expect(savedBody.question_timer_seconds).toBe(15);
  });
});
