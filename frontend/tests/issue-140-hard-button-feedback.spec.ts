import { test, expect } from '@playwright/test';

// Regression test for issue #140: pressing "Hard" on the stage-0 intro card gave
// no visible feedback and silently requeued the same phrase, and repeatedly
// pressing "Hard" on one phrase (hitting the retry cap) never counted it toward
// session progress. See temp_files/triage/issue-140-hard-button-confusing-behavior.md

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

test.describe('Issue #140 — Hard button feedback + progress accounting', () => {
  test('pressing Hard shows visible feedback before advancing', async ({ page }) => {
    await setFakeToken(page);
    await page.route('**/api/phrase-programs/1/study', async (route) => {
      await route.fulfill({ json: MOCK_STUDY_SESSION });
    });
    await page.route('**/api/phrases/1/progress', async (route) => {
      await route.fulfill({ json: { lesson_stage: 0, next_review: null, interval: 1 } });
    });

    await page.goto('/dashboard/phrases/1/study');
    await expect(page.getByTestId('hard-btn')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('hard-btn').click();

    // Visible acknowledgment must appear instead of an instant, unexplained repeat
    await expect(page.getByTestId('hard-feedback')).toBeVisible();
    await expect(page.getByTestId('hard-feedback')).toContainText('покажем эту фразу ещё раз');

    // Feedback clears itself and the (re-queued) intro card reappears
    await expect(page.getByTestId('hard-feedback')).toHaveCount(0, { timeout: 3000 });
    await expect(page.getByTestId('hard-btn')).toBeVisible();
  });

  test('repeatedly pressing Hard on one phrase still counts it as done', async ({ page }) => {
    await setFakeToken(page);
    let progressCalls = 0;
    await page.route('**/api/phrase-programs/1/study', async (route) => {
      await route.fulfill({ json: MOCK_STUDY_SESSION });
    });
    await page.route('**/api/phrases/1/progress', async (route) => {
      progressCalls++;
      await route.fulfill({ json: { lesson_stage: 0, next_review: null, interval: 1 } });
    });

    await page.goto('/dashboard/phrases/1/study');

    // Press "Hard" 3 times on the single phrase (retries: 0 -> 1 -> 2, cap hit on 3rd)
    for (let i = 0; i < 3; i++) {
      await expect(page.getByTestId('hard-btn')).toBeVisible({ timeout: 5000 });
      await page.getByTestId('hard-btn').click();
      await expect(page.getByTestId('hard-feedback')).toBeVisible();
      await expect(page.getByTestId('hard-feedback')).toHaveCount(0, { timeout: 3000 });
    }

    expect(progressCalls).toBe(3);

    // After the retry cap, the phrase must be marked done (progress bar reaches 100%)
    // instead of silently under-counting — this is the MatchRound screen that follows
    // a fully "done" queue.
    await expect(page.getByTestId('match-left-0')).toBeVisible({ timeout: 5000 });
  });
});
