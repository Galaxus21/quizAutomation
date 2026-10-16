import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const authDir = path.resolve(__dirname, '../.auth');
const authFile = path.join(authDir, 'student.json');

setup('Authenticate live student credentials from .env', async ({ page }) => {
  const email = process.env.STUDENT_EMAIL;
  const password = process.env.STUDENT_PASSWORD;

  if (!email || !password || password === 'your_password_here') {
    throw new Error('[Auth] Missing STUDENT_EMAIL or STUDENT_PASSWORD in .env');
  }

  console.log('\n======================================================');
  console.log(`[Auth] 1/4 Navigating to login portal (/login)...`);
  await page.goto('/login');

  console.log(`[Auth] 2/4 Entering credentials for student: ${email}`);
  await page.locator('input[name="email"], input[type="email"]').fill(email);
  await page.locator('input[name="password"], input[type="password"]').fill(password);

  console.log(`[Auth] 3/4 Submitting login form...`);
  const loginButton = page.getByRole('button', { name: /Log in|Sign in/i });
  await loginButton.click();

  // Wait for either a successful redirect or for the portal to finish handling the login request.
  try {
    await expect
      .poll(
        async () => page.url().includes('/student') || !(await loginButton.isDisabled()),
        { timeout: 20000 }
      )
      .toBe(true);
  } catch {
    throw new Error(
      '[Auth] Login request did not complete within 20 seconds; the portal kept the Log in button in its loading state. Check the portal/API connection and account credentials, then retry.'
    );
  }

  if (!page.url().includes('/student')) {
    const alerts = await page.locator('[role="alert"], [aria-live="assertive"]').allInnerTexts();
    const errorMessage = alerts.map((message) => message.trim()).filter(Boolean).join(' ');
    throw new Error(
      `[Auth] Login did not redirect to the student portal${errorMessage ? `: ${errorMessage}` : '.'}`
    );
  }

  // Assert the student session has finished loading.
  await expect(page.locator('text=Checking your session')).toHaveCount(0, { timeout: 15000 });

  // Extract sessionStorage entries dynamically
  const sessionData = await page.evaluate(() => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key) {
        const val = sessionStorage.getItem(key);
        if (val !== null) entries[key] = val;
      }
    }
    return entries;
  });

  // Persist storage state
  fs.mkdirSync(authDir, { recursive: true });
  await page.context().storageState({ path: authFile });
  fs.writeFileSync(path.join(authDir, 'session.json'), JSON.stringify(sessionData, null, 2));

  const expiresKey = Object.keys(sessionData).find((k) => k.endsWith('.access_expires_at'));
  console.log(`[Auth] 4/4 Login SUCCESSFUL! Redirected to ${page.url()}`);
  console.log(
    `[Auth] Session token acquired (expires: ${
      (expiresKey && sessionData[expiresKey]) || 'N/A'
    }) and saved to .auth/`
  );
  console.log('======================================================\n');
});
