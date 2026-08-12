import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    // Overridable so a run can pin the address family: uvicorn binds one of IPv4
    // or IPv6, while Chromium resolves "localhost" to ::1 first — which fails
    // against an IPv4-only server. PW_BASE_URL=http://127.0.0.1:8000 sidesteps it.
    baseURL: process.env.PW_BASE_URL || 'http://localhost:8000',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
