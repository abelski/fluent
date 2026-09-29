import { test, expect, type Page } from '@playwright/test';
import { ARTICLES, mockArticles } from './helpers/articlesBento';

// #55 — articles page as hero → category chips → bento (newest + next 3) → theme cards.
// /api/articles is mocked (helpers/articlesBento.ts): the page renders the build-time list
// first, then refreshes from the mock.

/** Waits until the runtime refresh has replaced the build-time list with the mock. */
async function ready(page: Page) {
  await expect(page.getByTestId('articles-hero-count')).toHaveText(String(ARTICLES.length));
}

test.describe('Articles bento', () => {
  test('hero: total, study-guides badge, «Читать новую» to the newest', async ({ page }) => {
    await mockArticles(page);
    await page.goto('/dashboard/articles');
    await ready(page);
    const hero = page.getByTestId('articles-hero');
    await expect(hero).toContainText('Статьи');
    await expect(hero).toContainText('5 учебных');
    await expect(hero).toContainText('в библиотеке');
    await expect(page.getByTestId('articles-read-newest')).toHaveAttribute('href', /\/dashboard\/articles\/pronunciation\/?$/);
  });

  test('featured = newest, stack = next three', async ({ page }) => {
    await mockArticles(page);
    await page.goto('/dashboard/articles');
    await ready(page);
    await expect(page.getByTestId('featured-heading')).toHaveText('Литовское произношение');
    await expect(page.getByTestId('featured-card')).toContainText('Новое · Учебные материалы');
    await expect(page.getByTestId('featured-card')).toContainText('Слова и произношение');
    const stack = page.getByTestId('stack-article');
    await expect(stack).toHaveCount(3);
    await expect(stack.nth(0)).toContainText('Литовский для Регитры');
    await expect(stack.nth(2)).toContainText('Будущее время');
  });

  test('category chips filter via ?category= with counts', async ({ page }) => {
    await mockArticles(page);
    await page.goto('/dashboard/articles');
    await ready(page);
    await expect(page.getByTestId('category-all')).toContainText('9');
    await expect(page.getByTestId('category-adaptation')).toContainText('2');
    await page.getByTestId('category-adaptation').click();
    await expect(page).toHaveURL(/\?category=adaptation$/);
    await expect(page.getByTestId('category-adaptation')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('featured-heading')).toHaveText('Литовский для Регитры');
    await expect(page.getByTestId('stack-article')).toHaveCount(1);
    await expect(page.getByTestId('theme-card')).toHaveCount(1);
    await page.goto('/dashboard/articles?category=blog');
    await expect(page.getByTestId('category-blog')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('featured-heading')).toHaveText('Как пользоваться Fluent');
  });

  test('theme cards: fixed order, «Другое» last, every article linked', async ({ page }) => {
    await mockArticles(page);
    await page.goto('/dashboard/articles');
    await ready(page);
    const cards = page.getByTestId('theme-card');
    await expect(cards).toHaveCount(7);
    const order = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-theme')));
    expect(order).toEqual(['verbs', 'numbers', 'cases', 'words', 'life', 'start', 'other']);
    await expect(cards.last()).toContainText('Другое');
    await expect(cards.last()).toContainText('Новая статья без темы');
    await expect(page.getByTestId('theme-section').locator('a[href^="/dashboard/articles/"]')).toHaveCount(ARTICLES.length);
  });

  test('popular themes scroll to the theme card', async ({ page }) => {
    await mockArticles(page);
    await page.goto('/dashboard/articles?category=blog');
    await expect(page.getByTestId('featured-heading')).toHaveText('Как пользоваться Fluent');
    const themes = page.getByTestId('articles-popular-themes');
    await expect(themes).toContainText('Глаголы2');
    await page.getByTestId('popular-theme-cases').click();
    await expect(page).toHaveURL(/\/dashboard\/articles\/?$/); // back to «Все» so the card exists
    await expect(page.locator('#theme-cases')).toBeInViewport();
  });

  test('375px: no horizontal overflow, popular themes hidden', async ({ page }) => {
    await mockArticles(page, { width: 375 });
    await page.goto('/dashboard/articles');
    await ready(page);
    await expect(page.getByTestId('articles-popular-themes')).toBeHidden();
    const chip = await page.getByTestId('category-all').boundingBox();
    expect(chip!.height).toBeGreaterThanOrEqual(44);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('EN copy', async ({ page }) => {
    await mockArticles(page, { lang: 'en' });
    await page.goto('/dashboard/articles');
    await ready(page);
    await expect(page.getByTestId('articles-hero')).toContainText('5 study guides');
    await expect(page.getByTestId('articles-read-newest')).toContainText('Read the newest');
    await expect(page.getByTestId('featured-heading')).toHaveText('Lithuanian pronunciation');
    await expect(page.getByTestId('theme-card').last()).toContainText('Other');
    await expect(page.getByTestId('theme-section')).toContainText('By topic');
  });
});
