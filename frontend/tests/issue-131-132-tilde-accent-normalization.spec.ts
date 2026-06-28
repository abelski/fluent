import { test, expect } from '@playwright/test';

test('issue #131/132 — normalizeLt strips Lithuanian stress marks (tilde, acute, grave)', async ({ page }) => {
  await page.goto('http://localhost:8000/');

  const results = await page.evaluate(() => {
    function collapseWs(text: string): string {
      return text.replace(/\s+/g, ' ').trim();
    }

    function normalizeLt(text: string): string {
      return collapseWs(
        text
          .normalize('NFD')
          .replace(/[̀́̃]/g, '')
          .normalize('NFC')
          .toLowerCase()
          .replace(/į/g, 'i').replace(/č/g, 'c').replace(/š/g, 's')
          .replace(/ž/g, 'z').replace(/ū/g, 'u').replace(/ų/g, 'u')
          .replace(/ę/g, 'e').replace(/ė/g, 'e').replace(/ą/g, 'a')
      );
    }

    return {
      tildeStripped: normalizeLt('plaũkti') === normalizeLt('plaukti'),
      caseAndTilde: normalizeLt('Plaukti') === normalizeLt('plaũkti'),
      acuteStripped: normalizeLt('namás') === normalizeLt('namas'),
      graveStripped: normalizeLt('dùona') === normalizeLt('duona'),
      ltDiacriticsWork: normalizeLt('širdis') === 'sirdis',
      uOgonekWorks: normalizeLt('ū') === 'u',
      whitespace: normalizeLt('  plaũkti  ') === normalizeLt('plaukti'),
    };
  });

  expect(results.tildeStripped).toBe(true);
  expect(results.caseAndTilde).toBe(true);
  expect(results.acuteStripped).toBe(true);
  expect(results.graveStripped).toBe(true);
  expect(results.ltDiacriticsWork).toBe(true);
  expect(results.uOgonekWorks).toBe(true);
  expect(results.whitespace).toBe(true);
});
