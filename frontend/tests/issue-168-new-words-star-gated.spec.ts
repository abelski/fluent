import { test, expect } from '@playwright/test';

// Issue #168 — when a study session silently falls back to already-known /
// review words because the list's remaining new words are gated behind a
// higher ★ complexity level than the user is currently on, the backend now
// returns `more_new_at_higher_level: true` + `new_words_at_higher_level: <N>`
// on the `/lists/{id}/study` response (both the `all_known` path and the
// normal fallback-to-review path — see root cause in
// plans/triage/active/issue-168-new-words-star-gated.md).
//
// The frontend (study/page.tsx) shows a banner
// (data-testid="more-new-at-higher-level-banner") with a CTA that calls
// setStarLevel(nextLevel) and reloads via loadWords(). Mocking/navigation
// conventions mirror the closely related star-level/all_known fix
// (plans/triage/implemented/IMPLEMENTED-issue-105-list-locked-after-mistakes.md)
// and frontend/tests/star-complexity.spec.ts (no dedicated issue-105 spec file
// exists to copy directly — that plan predates this repo's plans/ folder
// being git-tracked).

function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 }));
  return `${header}.${payload}.fakesignature`;
}

// Represents the review/learning words the session actually serves when new
// words are gated behind a higher star level — this is the bug's real
// trigger (session composition falls back to review), not an empty session.
const REVIEW_WORDS = [
  { id: 1, lithuanian: 'katė', translation_en: 'cat', translation_ru: 'кошка', hint: null, star: 1, status: 'learning' },
  { id: 2, lithuanian: 'šuo', translation_en: 'dog', translation_ru: 'собака', hint: null, star: 1, status: 'known' },
];

test.describe('Issue #168 — new-words-at-higher-level banner', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((token) => {
      localStorage.setItem('fluent_token', token);
    }, makeFakeJwt('Test User'));

    // QuizSession fetches these on mount regardless of which words are shown.
    await page.route('**/api/me/quota', (route) =>
      route.fulfill({ json: { is_premium: false, premium_active: false, sessions_today: 0, daily_limit: 10, is_admin: false, is_superadmin: false } })
    );
    await page.route('**/api/me/settings', (route) =>
      route.fulfill({
        json: {
          words_per_session: 10,
          new_words_ratio: 1.0,
          lesson_mode: 'thorough',
          use_question_timer: false,
          question_timer_seconds: 10,
          email_consent: true,
          lang: 'ru',
        },
      })
    );
    await page.route('**/api/words/*/progress', (route) => route.fulfill({ json: { ok: true } }));
  });

  test('banner renders and its CTA bumps the star level and reloads the session', async ({ page }) => {
    const studyUrls: string[] = [];
    await page.route('**/api/lists/*/study**', (route) => {
      studyUrls.push(route.request().url());
      route.fulfill({
        json: {
          words: REVIEW_WORDS,
          distractors: [],
          more_new_at_higher_level: true,
          new_words_at_higher_level: 7,
        },
      });
    });

    // No star-level cookie set → defaults to ★ (level 1), so the CTA should
    // offer ★★ (level 2).
    await page.goto('/dashboard/lists/_/study');

    const banner = page.getByTestId('more-new-at-higher-level-banner');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText('7');
    await expect(banner).toContainText('★★');

    // Initial load(s) happened at the default star_level=1. Next.js dev mode
    // double-invokes the mount effect (React Strict Mode), so one or two
    // requests may land here — assert only that whichever fired all used
    // star_level=1, not an exact count.
    await expect.poll(() => studyUrls.length).toBeGreaterThanOrEqual(1);
    for (const url of studyUrls) {
      expect(url).toContain('star_level=1');
    }
    const countBeforeClick = studyUrls.length;

    await banner.getByRole('button').click();

    // Clicking the CTA calls setStarLevel(2), which sets the star-level cookie...
    await expect
      .poll(async () => {
        const cookies = await page.context().cookies();
        return cookies.find((c) => c.name === 'fluent_star_level')?.value;
      })
      .toBe('2');

    // ...and reloads via loadWords(), firing a new /study request at the
    // bumped level.
    await expect.poll(() => studyUrls.length).toBeGreaterThan(countBeforeClick);
    expect(studyUrls[studyUrls.length - 1]).toContain('star_level=2');
  });
});
