import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';
import { DashboardPage } from '../pages/DashboardPage';
import { QuizPage } from '../pages/QuizPage';
import { defaultAnswerProvider } from '../services/AnswerService';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function run(): Promise<void> {
  const endpoint = process.env.CHROME_CDP_URL?.trim() || 'http://127.0.0.1:9222';
  const browser = await chromium.connectOverCDP(endpoint).catch(() => {
    throw new Error(
      `Could not connect to Chrome at ${endpoint}. Start Chrome with remote debugging enabled, then run npm run start:chrome.`
    );
  });
  const context = browser.contexts()[0];

  if (!context) {
    throw new Error('Chrome did not expose a browser context for automation.');
  }

  await context.setGeolocation({ latitude: 12.9715987, longitude: 77.5945627, accuracy: 10 });
  await context.grantPermissions(['geolocation']);

  const page = await context.newPage();
  const dashboardPage = new DashboardPage(page);
  const quizPage = new QuizPage(page);

  console.log('[Chrome Runner] Opened a new tab in the connected Chrome window.');
  await dashboardPage.navigate();
  await dashboardPage.expectLoaded();

  const attendedQuizIds = new Set<string>();
  let completedQuizCount = 0;

  while (true) {
    const openQuizIds = await dashboardPage.pollForOpenQuiz(5000, 15000, attendedQuizIds);

    for (const quizId of openQuizIds) {
      await quizPage.navigate(quizId);
      const result = await quizPage.attendFullQuiz(defaultAnswerProvider);
      attendedQuizIds.add(quizId);

      if (result.skippedAlreadyCompleted) {
        console.log(`[Chrome Runner] Skipped already-completed quiz: ${quizId}`);
      } else {
        completedQuizCount++;
        console.log(
          `[Chrome Runner] Submitted quiz ${quizId} (${result.questionsAnswered} questions; ${completedQuizCount} submitted this session).`
        );
      }

      await quizPage.returnToDashboard();
      await dashboardPage.expectLoaded();
    }
  }
}

void run();
