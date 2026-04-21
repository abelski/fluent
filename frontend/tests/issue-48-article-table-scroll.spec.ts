import { test, expect } from '@playwright/test';

const MOCK_ARTICLE_WITH_TABLE = {
  slug: 'test-table-article',
  title_ru: 'Тест таблицы',
  title_en: 'Table test',
  body_ru: '# Тест\n\n| Заголовок 1 | Заголовок 2 | Заголовок 3 | Заголовок 4 | Заголовок 5 |\n|---|---|---|---|---|\n| Ячейка 1 | Ячейка 2 | Ячейка 3 | Ячейка 4 | Ячейка 5 |',
  body_en: '# Test\n\n| Col 1 | Col 2 | Col 3 | Col 4 | Col 5 |\n|---|---|---|---|---|\n| Cell 1 | Cell 2 | Cell 3 | Cell 4 | Cell 5 |',
  tags: [],
  created_at: '2026-01-01T00:00:00',
  updated_at: '2026-01-01T00:00:00',
};

test('issue-48: article tables are wrapped in overflow-x-auto div', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  await page.route('**/api/articles/test-table-article', async (route) => {
    await route.fulfill({ json: MOCK_ARTICLE_WITH_TABLE });
  });

  await page.goto('/dashboard/articles/test-table-article');

  // Wait for article body to appear
  await expect(page.getByText('Тест таблицы')).toBeVisible({ timeout: 5000 });

  // The table must be wrapped in a div with overflow-x-auto
  const wrapper = page.locator('div.overflow-x-auto');
  await expect(wrapper).toBeVisible();

  // The wrapper must contain a table
  const tableInWrapper = wrapper.locator('table');
  await expect(tableInWrapper).toBeVisible();

  // Verify computed style allows horizontal scroll
  const overflowX = await wrapper.evaluate((el) =>
    window.getComputedStyle(el).overflowX
  );
  expect(['auto', 'scroll']).toContain(overflowX);
});
