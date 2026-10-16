import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const authDir = path.resolve(__dirname, '.auth');
const authFile = path.join(authDir, 'student.json');

if (!fs.existsSync(authFile)) {
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
}

export default defineConfig({
  timeout: 0,
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html'], ['list']],
  use: {
    baseURL: process.env.BASE_URL,
    headless: false,
    launchOptions: {
      slowMo: 400,
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 800 },
    geolocation: { latitude: 12.9715987, longitude: 77.5945627, accuracy: 10 },
    permissions: ['geolocation'],
  },
  projects: [
    {
      name: 'unit',
      testMatch: /(?:answer-service|quiz-page)\.spec\.ts/,
      use: { headless: true },
    },
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
      },
      dependencies: ['setup'],
      testIgnore: [/auth\.setup\.ts/, /(?:answer-service|quiz-page)\.spec\.ts/],
    },
  ],
});
