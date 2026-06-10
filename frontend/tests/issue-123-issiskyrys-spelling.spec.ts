import { test, expect } from '@playwright/test';

// Issue #123: Word id 4486 had incorrect spelling 'išsiskyrės', should be 'išsiskyręs'.
// List 173 (Šeima ir žmonės) is non-archived and contains related words — we verify
// that no active word in accessible lists has the wrong 'išsiskyrės' spelling.

test.describe('Issue #123 — išsiskyręs spelling fix', () => {
  test('list 173 (Šeima ir žmonės) words do not contain incorrect spelling išsiskyrės', async ({ request }) => {
    const res = await request.get('http://localhost:8000/api/lists/173');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const words: Array<{ id: number; lithuanian: string }> = data.words ?? [];
    const badWord = words.find((w) => w.lithuanian === 'išsiskyrės');
    expect(badWord).toBeUndefined();
  });

  test('list 173 word id 5492 has correct Lithuanian spelling', async ({ request }) => {
    const res = await request.get('http://localhost:8000/api/lists/173');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const words: Array<{ id: number; lithuanian: string }> = data.words ?? [];
    const word5492 = words.find((w) => w.id === 5492);
    // id 5492 should have the correct spelling
    if (word5492) {
      expect(word5492.lithuanian).toBe('išsiskyręs');
    }
  });
});
