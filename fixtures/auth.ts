import { Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const sessionFile = path.resolve(__dirname, '../.auth/session.json');

/**
 * Injects authenticated student session state from .auth/session.json into sessionStorage.
 */
export async function setupSessionAuth(page: Page): Promise<void> {
  let liveSession: Record<string, string> | null = null;

  if (fs.existsSync(sessionFile)) {
    try {
      liveSession = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    } catch {
      liveSession = null;
    }
  }

  if (liveSession && Object.keys(liveSession).length > 0) {
    await page.addInitScript((entries: Record<string, string>) => {
      for (const [key, val] of Object.entries(entries)) {
        if (typeof val === 'string' && !sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, val);
        }
      }
    }, liveSession);
    return;
  }

  console.warn('[Auth] No saved session found in .auth/session.json. Run auth.setup.ts first.');
}
