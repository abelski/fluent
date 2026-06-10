Ask the user (generate inline dialog): "Test locally? (yes/y for localhost:3000, anything else for production)"

Based on the answer:
- If the answer is "yes" or "y" (case-insensitive): set BASE_URL = "http://localhost:3000"
- Otherwise: set BASE_URL = "https://fluent-qhk8.onrender.com"

## Smoke test steps

Use Playwright browser tools to run the following checks against BASE_URL. Report PASS/FAIL for each.

### 1. Landing page loads
- Navigate to `BASE_URL/`
- Verify the page title or main heading is visible
- Verify navigation/header is present

### 2. Grammar page loads
- Navigate to `BASE_URL/dashboard/grammar`
- Verify the page loads (no error screen)
- Verify header and footer are present
- Verify at least one lesson or content item is visible

### 3. Dashboard loads
- Navigate to `BASE_URL/dashboard`
- Verify the page loads (no error screen)
- Verify navigation menu items are present

### 4. Lists page loads
- Navigate to `BASE_URL/dashboard/lists`
- Verify the page loads (no error screen)
- Verify header and footer are present

### 5. Login flow reachable
- Navigate to `BASE_URL/`
- Verify a login button or link is visible (do not actually log in)

## Report

After all checks, print a summary table:

| Page | Status |
|------|--------|
| Landing | PASS/FAIL |
| Grammar | PASS/FAIL |
| Dashboard | PASS/FAIL |
| Lists | PASS/FAIL |
| Login visible | PASS/FAIL |

If any check fails, describe what was missing or broken.
