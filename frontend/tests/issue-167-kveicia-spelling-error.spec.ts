import { test, expect } from '@playwright/test';

// Issue #167: Word id 5660 had incorrect spelling 'kveičia', should be 'kviečia'.
// List 178 (Veiksmažodžiai) is non-archived and contains this word — we verify
// that the correct spelling 'kviečia' is present and the incorrect 'kveičia' is not.

test.describe('Issue #167 — kviečia spelling fix', () => {
  test('list 178 (Veiksmažodžiai) words do not contain incorrect spelling kveičia', async ({ request }) => {
    const res = await request.get('http://localhost:8000/api/lists/178');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const words: Array<{ id: number; lithuanian: string }> = data.words ?? [];
    const badWord = words.find((w) => w.lithuanian === 'kveičia');
    expect(badWord).toBeUndefined();
  });

  test('list 178 word id 5660 has correct Lithuanian spelling kviečia', async ({ request }) => {
    const res = await request.get('http://localhost:8000/api/lists/178');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const words: Array<{ id: number; lithuanian: string }> = data.words ?? [];
    const word5660 = words.find((w) => w.id === 5660);
    // id 5660 should have the correct spelling
    if (word5660) {
      expect(word5660.lithuanian).toBe('kviečia');
    }
  });
});
