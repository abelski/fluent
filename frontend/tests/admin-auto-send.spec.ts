import { test, expect } from '@playwright/test';
import { openAutoSend } from './helpers/adminAutoSend';

// #57 — Admin → Content → Settings: the auto-send block gains a third switch for
// balance tips, off by default, and the PATCH carries it. Fully mocked.

test('third toggle renders off; PATCH body includes auto_send_balance_tips', async ({ page }) => {
  const patches = await openAutoSend(page);
  await expect(page.getByTestId('autosend-block').getByRole('switch')).toHaveCount(3);
  const toggle = page.getByTestId('autosend-auto_send_balance_tips');
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('autosend-block')).toContainText('Советы по балансу (письмо + входящие)');
  await page.getByTestId('autosend-save').click();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toMatchObject({ auto_send_balance_tips: false });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('autosend-save').click();
  await expect.poll(() => patches.length).toBe(2);
  expect(patches[1]).toEqual({ auto_send_inactive_emails: true, auto_send_weekly_rewards: true, auto_send_balance_tips: true });
});
