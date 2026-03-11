import { test, expect } from '@playwright/test';

// Fake but structurally valid JWT — the frontend only base64-decodes the payload,
// it does NOT verify the signature client-side, so this is enough for UI tests.
function makeFakeJwt(name: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({ email: 'test@test.com', name, exp: 9999999999 })
  );
  return `${header}.${payload}.fakesignature`;
}

test.describe('Login flow', () => {
  test('login button points to backend auth endpoint, not frontend port', async ({ page }) => {
    await page.goto('/login');
    const loginLink = page.getByRole('link', { name: /Войти через Google/ });
    const href = await loginLink.getAttribute('href');
    expect(href).toContain('/api/auth/google');
    expect(href).not.toContain(':3000');
  });

  test('OAuth callback: token in URL is stored and user is redirected to /dashboard/lists', async ({ page }) => {
    const token = makeFakeJwt('Test User');

    // Simulate the backend OAuth callback redirect
    await page.goto(`/dashboard?token=${token}`);

    // Should end up on /dashboard/lists
    await expect(page).toHaveURL(/\/dashboard\/lists/, { timeout: 5000 });

    // Token must be stored in localStorage
    const stored = await page.evaluate(() => localStorage.getItem('fluent_token'));
    expect(stored).not.toBeNull();
  });

  test('OAuth callback: token is NOT left in URL (stripped by history.replaceState)', async ({ page }) => {
    const token = makeFakeJwt('Test User');
    await page.goto(`/dashboard?token=${token}`);
    await expect(page).toHaveURL(/\/dashboard\/lists/, { timeout: 5000 });

    // After redirect the token query param must be gone
    const url = page.url();
    expect(url).not.toContain('token=');
  });

  test('OAuth callback: logged-in user is shown in header after redirect', async ({ page }) => {
    const token = makeFakeJwt('Test User');
    await page.goto(`/dashboard?token=${token}`);
    await expect(page).toHaveURL(/\/dashboard\/lists/, { timeout: 5000 });

    // Header should display the user name
    await expect(page.getByText('Test User')).toBeVisible();
  });

  test('no token: unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\/?$/, { timeout: 5000 });
  });

  test('no token: unauthenticated user on /dashboard/lists is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard/lists');
    await expect(page).toHaveURL(/\/login\/?$/, { timeout: 5000 });
  });
});
