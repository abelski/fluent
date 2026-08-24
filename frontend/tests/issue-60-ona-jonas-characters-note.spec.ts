// Issue #60 — "Ona" is a recurring character name in grammar exercises, but its Russian
// translation looks like the pronoun "она" (she) in nominative sentences and like "Оны" (an
// unfamiliar-looking genitive of a name) elsewhere. Investigation confirmed the underlying data
// is linguistically correct — the confusion is purely that Russian-speaking learners aren't told
// "Ona" is a name, the same way "Jonas" is used consistently. Fix: a one-line note on the grammar
// page intro explaining both characters, so a learner sees it before hitting an "Ona" sentence.
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

async function mockGrammarProgramsEnrolled(page: import('@playwright/test').Page) {
  await page.route('**/api/grammar-programs', async (route) => {
    await route.fulfill({
      json: [{ id: 1, title: 'Литовские падежи', title_en: null, description: null, difficulty: 1, enrolled: true }],
    });
  });
}

test.describe('Issue #60 — Jonas/Ona characters note', () => {
  test('grammar page intro explains Jonas and Ona are recurring characters', async ({ page }) => {
    await setFakeToken(page);
    await mockGrammarProgramsEnrolled(page);
    await page.goto('/dashboard/grammar');
    await expect(page.getByText('В упражнениях используются персонажи Йонас и Она.')).toBeVisible();
  });
});
