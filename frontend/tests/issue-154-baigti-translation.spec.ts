// Issue #154 — word id 7315 "baigti" should have translation_ru = "закончить, заканчивать"
// instead of the inappropriate "кончить, кончать" (vulgar in Russian)

import { test, expect } from '@playwright/test';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';
const LIST_ID = 294; // "Основные глаголы" list containing word 7315
const WORD_ID = 7315;
const EXPECTED_LITHUANIAN = 'baigti';
const EXPECTED_TRANSLATION_RU = 'закончить, заканчивать';

test('Word id 7315 "baigti" has correct Russian translation', async ({ request }) => {
  // Fetch the word list that contains word 7315
  const res = await request.get(`${BACKEND_URL}/api/lists/${LIST_ID}`);
  expect(res.status()).toBe(200);

  const list = await res.json();
  expect(list).toHaveProperty('words');

  // Find word 7315 in the list
  const word = list.words.find((w: any) => w.id === WORD_ID);
  expect(word).toBeDefined();

  // Verify the word has the correct Lithuanian form and Russian translation
  expect(word.lithuanian).toBe(EXPECTED_LITHUANIAN);
  expect(word.translation_ru).toBe(EXPECTED_TRANSLATION_RU);
});
