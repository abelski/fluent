import { test, expect } from '@playwright/test';

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

const MOCK_PROGRAMS = [
  {
    id: 1,
    title: 'Туристические фразы',
    title_en: 'Tourist Basics',
    description: 'Основные фразы для туристов',
    description_en: 'Essential phrases for tourists',
    difficulty: 1,
    phrase_count: 25,
    enrolled: false,
    stage_distribution: null,
  },
];

const MOCK_PROGRAMS_ENROLLED = [
  { ...MOCK_PROGRAMS[0], enrolled: true, stage_distribution: { stage0: 20, stage1: 3, stage2: 2 } },
];

const MOCK_STUDY_SESSION = {
  phrases: [
    {
      id: 1,
      text: 'Labas rytas!',
      translation: 'Доброе утро!',
      lesson_stage: 0,
      blank_word: 'rytas',
      mcq_distractors: ['Labas', 'vakaras', 'naktis'],
      next_review: null,
    },
  ],
};

test.describe('Phrases — navigation', () => {
  test('Фразы nav link is visible', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard/phrases');
    await expect(page.getByRole('link', { name: 'Фразы' })).toBeVisible();
  });

  test('Фразы link is active on /dashboard/phrases', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/phrase-programs', async (route) => {
      await route.fulfill({ json: MOCK_PROGRAMS });
    });
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({ json: { premium_active: false, sessions_today: 0, daily_limit: 10 } });
    });
    await page.goto('/dashboard/phrases');
    await expect(page.getByRole('link', { name: 'Фразы' })).toHaveClass(/bg-white/);
  });
});

test.describe('Phrases — unauthenticated', () => {
  test('shows login prompt when not authenticated', async ({ page }) => {
    await page.route('**/api/phrase-programs', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.goto('/dashboard/phrases');
    await expect(page.getByText('Войдите, чтобы изучать фразы.')).toBeVisible();
  });
});

test.describe('Phrases — program list', () => {
  test('shows available programs on /phrase-programs page', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/phrase-programs', async (route) => {
      await route.fulfill({ json: MOCK_PROGRAMS });
    });

    await page.goto('/phrase-programs');
    await expect(page.getByText('Туристические фразы')).toBeVisible();
    await expect(page.getByText('25 фраз')).toBeVisible();
    await expect(page.getByTestId('enroll-button')).toBeVisible();
  });

  test('enroll button on /phrase-programs marks program as Добавлено', async ({ page }) => {
    await setFakeToken(page);
    let enrollCalled = false;
    await page.route('**/api/phrase-programs', async (route) => {
      await route.fulfill({ json: enrollCalled ? MOCK_PROGRAMS_ENROLLED : MOCK_PROGRAMS });
    });
    await page.route('**/api/me/phrase-programs/1', async (route) => {
      enrollCalled = true;
      await route.fulfill({ json: { ok: true } });
    });

    await page.goto('/phrase-programs');
    await page.getByTestId('enroll-button').click();

    // After enroll, the enrolled badge should appear
    await expect(page.getByText('Добавлено')).toBeVisible({ timeout: 5000 });
  });

  test('shows enrolled program with stage progress bar', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/phrase-programs', async (route) => {
      await route.fulfill({ json: MOCK_PROGRAMS_ENROLLED });
    });
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({ json: { premium_active: false, sessions_today: 0, daily_limit: 10 } });
    });

    await page.goto('/dashboard/phrases');
    await expect(page.getByTestId('study-button')).toBeVisible();
    await expect(page.getByText(/освоено/)).toBeVisible();
  });
});

test.describe('Phrases — study session', () => {
  test('stage 0 card shows phrase and translation', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/phrase-programs/1/study', async (route) => {
      await route.fulfill({ json: MOCK_STUDY_SESSION });
    });

    await page.goto('/dashboard/phrases/1/study');
    await expect(page.getByTestId('phrase-session-stage0')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Labas rytas!')).toBeVisible();
    await expect(page.getByText('Доброе утро!')).toBeVisible();
  });

  test('"Got it" button records progress and advances', async ({ page }) => {
    await setFakeToken(page);
    let progressCalled = false;
    await page.route('**/api/phrase-programs/1/study', async (route) => {
      await route.fulfill({ json: MOCK_STUDY_SESSION });
    });
    await page.route('**/api/phrases/1/progress', async (route) => {
      progressCalled = true;
      await route.fulfill({ json: { lesson_stage: 1, next_review: '2026-04-19', interval: 1 } });
    });

    await page.goto('/dashboard/phrases/1/study');
    await expect(page.getByTestId('got-it-btn')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('got-it-btn').click();

    // Session complete screen should appear (only 1 phrase)
    await expect(page.getByText('Сессия завершена!')).toBeVisible({ timeout: 5000 });
    expect(progressCalled).toBe(true);
  });
});

test.describe('Phrases — settings tab', () => {
  test('Фразы tab is visible in settings', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/me/settings', async (route) => {
      await route.fulfill({ json: { words_per_session: 10, new_words_ratio: 0.7, lesson_mode: 'thorough', use_question_timer: false, question_timer_seconds: 5, email_consent: true, lang: 'ru' } });
    });
    await page.route('**/api/me/phrases-settings', async (route) => {
      await route.fulfill({ json: { phrases_per_session: 10 } });
    });

    await page.goto('/dashboard/settings');
    await expect(page.getByText('Фразы')).toBeVisible();
  });

  test('phrases per session slider saves to server', async ({ page }) => {
    await setFakeToken(page);
    let patchedValue: number | null = null;
    await page.route('**/api/me/settings', async (route) => {
      await route.fulfill({ json: { words_per_session: 10, new_words_ratio: 0.7, lesson_mode: 'thorough', use_question_timer: false, question_timer_seconds: 5, email_consent: true, lang: 'ru' } });
    });
    await page.route('**/api/me/phrases-settings', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { phrases_per_session: 10 } });
      } else {
        const body = await route.request().postDataJSON();
        patchedValue = body.phrases_per_session;
        await route.fulfill({ json: { phrases_per_session: body.phrases_per_session } });
      }
    });

    await page.goto('/dashboard/settings');
    // Click the Фразы tab within the settings tab bar (not the nav link)
    await page.locator('[data-testid="settings-tabs"]').getByRole('button', { name: 'Фразы' }).click();

    await expect(page.getByTestId('phrases-session-size-slider')).toBeVisible({ timeout: 3000 });
    await page.getByTestId('phrases-session-size-slider').fill('15');
    await page.getByRole('button', { name: /Сохранить|Save/ }).click();

    // Wait for the PATCH request to complete
    await page.waitForResponse('**/api/me/phrases-settings', { timeout: 3000 });
    expect(patchedValue).not.toBeNull();
  });
});

test.describe('Phrases — admin tab', () => {
  test('Фразы tab visible in admin content section for admin users', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/admin/users', async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/me/quota', async (route) => {
      await route.fulfill({ json: { premium_active: false, sessions_today: 0, daily_limit: null, is_admin: true } });
    });
    // Intercept admin user fetch so admin panel loads
    await page.route('**/api/admin/**', async (route) => {
      await route.fulfill({ json: [] });
    });

    await page.goto('/dashboard/admin');
    // Switch to Content area
    await page.getByRole('button', { name: 'Контент' }).click();
    // Phrases sub-tab should be visible in the content sub-tab bar
    await expect(page.getByRole('button', { name: 'Фразы' })).toBeVisible({ timeout: 5000 });
  });
});
