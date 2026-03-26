-- Run on Neon console BEFORE deploying code that uses is_superadmin.
-- Safe to re-run: ADD COLUMN IF NOT EXISTS is idempotent.

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT FALSE;

-- Grant superadmin to the owner account.
UPDATE "user" SET is_superadmin = TRUE WHERE email = 'artyrbelski@gmail.com';
