import { test, expect } from '@playwright/test';

// Issue #124: Incorrect stress mark positions in A1-A2 vocabulary words.
// Tests verify that words in non-archived lists show the correct accented markup.

test.describe('Issue #124 — A1-A2 stress mark corrections', () => {
  test('list 194 (Šiandien eisiu į turgų) — turgus, žalias, rudas have correct stress marks', async ({ request }) => {
    const res = await request.get('http://localhost:8000/api/lists/194');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const words: Array<{ id: number; lithuanian: string; accented: string }> = data.words ?? [];

    const turgus = words.find((w) => w.id === 3210);
    if (turgus) expect(turgus.accented).toBe('*tur*gus');

    const zaliasA = words.find((w) => w.id === 3485);
    if (zaliasA) expect(zaliasA.accented).toBe('*ža*lias');

    const rudasA = words.find((w) => w.id === 5503);
    if (rudasA) expect(rudasA.accented).toBe('*ru*das');
  });

  test('list 157 (Drabužiai ir aksesuarai) — glaudės has correct stress mark', async ({ request }) => {
    const res = await request.get('http://localhost:8000/api/lists/157');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const words: Array<{ id: number; lithuanian: string; accented: string }> = data.words ?? [];

    const glaudes = words.find((w) => w.id === 4181);
    if (glaudes) expect(glaudes.accented).toBe('*glau*dės');
  });

  test('list 171 (Patiekalai) — sriuba has correct stress mark', async ({ request }) => {
    const res = await request.get('http://localhost:8000/api/lists/171');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const words: Array<{ id: number; lithuanian: string; accented: string }> = data.words ?? [];

    const sriuba = words.find((w) => w.id === 3502);
    if (sriuba) expect(sriuba.accented).toBe('sriu*ba*');
  });

  test('list 172 (Profesijos ir darbas) — sutartis has correct stress mark', async ({ request }) => {
    const res = await request.get('http://localhost:8000/api/lists/172');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const words: Array<{ id: number; lithuanian: string; accented: string }> = data.words ?? [];

    for (const id of [5038, 5485]) {
      const word = words.find((w) => w.id === id);
      if (word) expect(word.accented).toBe('sutar*tis*');
    }
  });

  test('list 174 (Spalvos) — rudas and žalias have correct stress marks', async ({ request }) => {
    const res = await request.get('http://localhost:8000/api/lists/174');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const words: Array<{ id: number; lithuanian: string; accented: string }> = data.words ?? [];

    const rudas4240 = words.find((w) => w.id === 4240);
    if (rudas4240) expect(rudas4240.accented).toBe('*ru*das');

    const zalias4246 = words.find((w) => w.id === 4246);
    if (zalias4246) expect(zalias4246.accented).toBe('*ža*lias');
  });
});
