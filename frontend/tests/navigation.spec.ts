import { test, expect } from '@playwright/test';

// Fake but structurally valid JWT for UI tests (frontend only base64-decodes payload).
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

async function mockGrammarProgramsEnrolled(page: import('@playwright/test').Page) {
  await page.route('**/api/grammar-programs', async (route) => {
    await route.fulfill({
      json: [{ id: 1, title: 'Литовские падежи', title_en: null, description: null, difficulty: 1, enrolled: true }],
    });
  });
}

test.describe('Navigation', () => {
  test('landing page loads and shows branding', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=fluent').first()).toBeVisible();
  });

  test('nav shows Слова, Грамматика, Практика', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard/lists');
    await expect(page.getByRole('link', { name: 'Слова' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Грамматика/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Практика' })).toBeVisible();
  });

  test('Слова link is active on /dashboard/lists', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard/lists');
    const link = page.getByRole('link', { name: 'Слова' });
    await expect(link).toHaveClass(/bg-white/);
  });

  test('Грамматика link navigates to grammar page', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard/lists');
    await page.getByRole('link', { name: /Грамматика/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/grammar/);
    await expect(page.getByRole('link', { name: /Грамматика/ })).toHaveClass(/bg-white/);
  });

  test('Практика link navigates to practice page', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard/lists');
    await page.getByRole('link', { name: 'Практика' }).click();
    await expect(page).toHaveURL(/\/dashboard\/practice/);
    await expect(page.getByRole('link', { name: 'Практика' })).toHaveClass(/bg-white/);
  });
});


test.describe('Grammar page — categories', () => {
  test('enrolled program has a chip with the enrolled dot; «Все» is selected by default', async ({ page }) => {
    await setFakeToken(page);
    await mockGrammarProgramsEnrolled(page);
    await page.goto('/dashboard/grammar');
    // Program chip uses program id: program id=1 → data-testid="category-program-1"
    const chip = page.locator('[data-testid="category-program-1"]');
    await expect(chip).toBeVisible({ timeout: 5000 });
    await expect(chip.getByTestId('enrolled-dot')).toBeVisible();
    await expect(page.getByTestId('category-all')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Падежи chip can be selected and deselected via «Все»', async ({ page }) => {
    await setFakeToken(page);
    await mockGrammarProgramsEnrolled(page);
    await page.goto('/dashboard/grammar');
    const chip = page.locator('[data-testid="category-program-1"]');
    await expect(chip).toBeVisible({ timeout: 5000 });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('topics-section')).toContainText('Литовские падежи');
    await page.getByTestId('category-all').click();
    await expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

});

test.describe('Grammar page — lesson levels', () => {
  // Helper: click the first lesson card of the given level label.
  // Lessons are level buttons on the topic cards.
  async function startFirstLessonOfLevel(page: import('@playwright/test').Page, levelLabel: string) {
    await setFakeToken(page);
    await mockGrammarProgramsEnrolled(page);
    // Mock verb-lessons to return empty so only noun lessons are shown
    await page.route(/\/api\/grammar\/verb-lessons/, async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="topic-card"] button', { timeout: 5000 });
    const card = page.locator('[data-testid="topic-card"] button').filter({ hasText: levelLabel }).first();
    await card.click();
    // Wait for exercise screen: "К урокам" back button is unique to exercise view
    await expect(page.getByText('К урокам')).toBeVisible({ timeout: 8000 });
  }

  test('advanced lesson collapsible hint can be toggled', async ({ page }) => {
    await startFirstLessonOfLevel(page, 'Продвинутый');
    const hint = page.getByText('Грамматическая подсказка');
    // Initially collapsed — rule content not visible
    await expect(page.getByText('Использование')).not.toBeVisible();
    await hint.click();
    // After click — rule details visible
    await expect(page.locator('text=/Винительный|Родительный|Дательный|Местный|Творительный/')).toBeVisible();
  });

  test('practice lesson shows no grammar hint', async ({ page }) => {
    await startFirstLessonOfLevel(page, 'Повторение');
    // No hint button at all
    await expect(page.getByText('Грамматическая подсказка')).not.toBeVisible();
    await expect(page.getByText('Грамматическое правило')).not.toBeVisible();
  });


});

test.describe('Grammar progression — locking', () => {
  const MOCK_LESSONS = [
    {
      id: 1, title: 'Падежи', level: 'basic', cases: [4], task_count: 2,
      rules: [], is_locked: false, best_score_pct: null,
    },
    {
      id: 2, title: 'Падежи', level: 'advanced', cases: [4], task_count: 2,
      rules: [], is_locked: true, best_score_pct: null,
    },
  ];

  test('locked lesson shows lock icon and cannot be clicked', async ({ page }) => {
    await setFakeToken(page);
    await mockGrammarProgramsEnrolled(page);
    await page.route('**/api/grammar/lessons', async (route) => {
      await route.fulfill({ json: MOCK_LESSONS });
    });
    await page.route(/\/api\/grammar\/verb-lessons/, async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="topic-card"] button', { timeout: 5000 });

    // Second lesson should have data-testid="lesson-locked" and be disabled
    const lockedCard = page.locator('[data-testid="lesson-locked"]').first();
    await expect(lockedCard).toBeVisible();
    await expect(lockedCard).toBeDisabled();
  });

  test('unlocked lesson is clickable', async ({ page }) => {
    await setFakeToken(page);
    await mockGrammarProgramsEnrolled(page);
    await page.route('**/api/grammar/lessons', async (route) => {
      await route.fulfill({ json: MOCK_LESSONS });
    });
    await page.route(/\/api\/grammar\/verb-lessons/, async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="topic-card"] button', { timeout: 5000 });

    // First lesson is unlocked — should NOT have lesson-locked testid
    const cards = page.locator('[data-testid="topic-card"] button');
    await expect(cards.first()).not.toBeDisabled();
    await expect(cards.first()).not.toHaveAttribute('data-testid', 'lesson-locked');
  });

  test('passing lesson shows next lesson button on done screen', async ({ page }) => {
    await setFakeToken(page);
    await mockGrammarProgramsEnrolled(page);
    // Lesson 1 passed → lesson 2 now unlocked
    const lessonsAfterPass = [
      { ...MOCK_LESSONS[0], best_score_pct: 0.9 },
      { ...MOCK_LESSONS[1], is_locked: false },
    ];
    let callCount = 0;
    await page.route('**/api/grammar/lessons', async (route) => {
      callCount++;
      await route.fulfill({ json: callCount === 1 ? MOCK_LESSONS : lessonsAfterPass });
    });
    await page.route(/\/api\/grammar\/verb-lessons/, async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/grammar/lessons/1/tasks', async (route) => {
      await route.fulfill({
        json: [
          { type: 'declension', prompt_lt: 'namas', prompt_ru: 'дом', case_name: 'Galininkas', number: 'vienaskaita', answer: 'namą' },
          { type: 'declension', prompt_lt: 'knyga', prompt_ru: 'книга', case_name: 'Galininkas', number: 'vienaskaita', answer: 'knygą' },
        ],
      });
    });
    await page.route('**/api/grammar/lessons/1/results', async (route) => {
      await route.fulfill({ json: { ok: true, passed: true } });
    });

    await page.goto('/dashboard/grammar');
    await page.waitForSelector('[data-testid="topic-card"] button', { timeout: 5000 });

    // Start lesson 1
    await page.locator('[data-testid="topic-card"] button').first().click();
    await expect(page.getByText('К урокам')).toBeVisible({ timeout: 5000 });

    // Answer both tasks correctly
    for (const answer of ['namą', 'knygą']) {
      const input = page.locator('input[type="text"]');
      await input.fill(answer);
      await input.press('Enter');
      await page.waitForTimeout(1200);
    }

    // Done screen should show pass banner and next lesson button
    await expect(page.getByText(/Пройдено/)).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('button', { name: 'Следующий урок' })).toBeVisible();
  });

  test('failing lesson shows retry recommendation, no next lesson button', async ({ page }) => {
    await setFakeToken(page);
    await mockGrammarProgramsEnrolled(page);
    await page.route('**/api/grammar/lessons', async (route) => {
      await route.fulfill({ json: MOCK_LESSONS });
    });
    await page.route(/\/api\/grammar\/verb-lessons/, async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.route('**/api/grammar/lessons/1/tasks', async (route) => {
      await route.fulfill({
        json: [
          { type: 'declension', prompt_lt: 'namas', prompt_ru: 'дом', case_name: 'Galininkas', number: 'vienaskaita', answer: 'namą' },
          { type: 'declension', prompt_lt: 'knyga', prompt_ru: 'книга', case_name: 'Galininkas', number: 'vienaskaita', answer: 'knygą' },
        ],
      });
    });
    await page.route('**/api/grammar/lessons/1/results', async (route) => {
      await route.fulfill({ json: { ok: true, passed: false } });
    });

    await page.goto('/dashboard/grammar');
    await page.getByTestId('level-button').first().click();
    await expect(page.getByText('К урокам')).toBeVisible({ timeout: 5000 });

    // Answer both tasks wrong, then dismiss each (wrong answers no longer auto-advance)
    for (let i = 0; i < 2; i++) {
      const input = page.locator('input[type="text"]');
      await input.fill('wrong');
      await input.press('Enter');
      await page.locator('[data-testid="dismiss-wrong"]').click({ timeout: 3000 });
    }

    // Done screen should show fail banner, no "Следующий урок" button
    await expect(page.getByText(/Результат ниже 75%/)).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Следующий урок')).not.toBeVisible();
  });
});

test.describe('Practice page', () => {
  test('shows Практика heading and category prompt', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard/practice');
    await expect(page.getByRole('heading', { name: 'Практика', exact: true })).toBeVisible();
    // #55: the category prompt became the hero subtitle (no categories mocked → onboarding copy).
    await expect(page.getByTestId('stats-card-practice')).toContainText('Добавь программу');
  });
});

test.describe('Dashboard redirect', () => {
  test('/dashboard with token redirects to /dashboard/lists', async ({ page }) => {
    await setFakeToken(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard\/lists/);
  });
});
