import { test, expect } from '@playwright/test';

// Issue #166: word ids 5197/5200 (lithuanian='elektroninis bilietas') had a
// corrupted `accented` value 'elek*tro*nis bi*lie*tas' — stripping the
// stress-mark asterisks gave 'elektronis bilietas' (missing the "ni"), which
// leaked into the study UI even though answer-grading (keyed off `lithuanian`)
// was unaffected. List 177 (Transportas ir kelionės) is public and non-archived
// and contains word id 5197 — we verify via the same GET /api/lists/{id}
// endpoint used by backend/tests/test_admin_word_accented_validation.py that
// the served `accented` field is now correctly formed.

test.describe('Issue #166 — elektroninis bilietas accented field fix', () => {
  test('list 177 word id 5197 has a correctly-formed accented field', async ({ request }) => {
    const res = await request.get('http://localhost:8000/api/lists/177');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const words: Array<{ id: number; lithuanian: string; accented: string | null }> = data.words ?? [];
    const word = words.find((w) => w.id === 5197);
    expect(word).toBeDefined();
    expect(word!.lithuanian).toBe('elektroninis bilietas');
    // The stress-marked value, asterisks stripped, must equal the full
    // lithuanian text — not the old corrupted 'elektronis bilietas'.
    expect(word!.accented).toBe('elek*tro*ninis bi*lie*tas');
    expect(word!.accented!.replace(/\*/g, '')).toBe('elektroninis bilietas');
  });

  test('list 177 does not contain the old corrupted accented value', async ({ request }) => {
    const res = await request.get('http://localhost:8000/api/lists/177');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    const words: Array<{ id: number; accented: string | null }> = data.words ?? [];
    const corrupted = words.find((w) => w.accented === 'elek*tro*nis bi*lie*tas');
    expect(corrupted).toBeUndefined();
  });
});
