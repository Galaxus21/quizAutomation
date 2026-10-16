import { test, expect } from '../fixtures/portal.fixture';
import { defaultAnswerProvider } from '../services/AnswerService';

test.describe('Live Quiz Assessment Runner', () => {
  test('Wait for published demo quiz, attend all questions dynamically, and submit', async ({
    dashboardPage,
    quizPage,
  }) => {
    test.setTimeout(0);

    console.log('\n======================================================');
    console.log('[Runner] Starting Live Quiz Assessment Runner');
    console.log('======================================================');

    await dashboardPage.navigate();
    await dashboardPage.expectLoaded();

    const attendedQuizIds = new Set<string>();
    let totalBatchesCompleted = 0;

    while (true) {
      const openQuizIds = await dashboardPage.pollForOpenQuiz(5000, 15000, attendedQuizIds);
      expect(openQuizIds.length, 'Expected at least one published open quiz on the dashboard').toBeGreaterThan(0);

      for (let i = 0; i < openQuizIds.length; i++) {
        const quizId = openQuizIds[i];
        console.log(`\n======================================================`);
        console.log(`[Runner] [${i + 1}/${openQuizIds.length}] ATTEMPTING QUIZ ID: ${quizId}`);
        console.log(`======================================================`);

        await quizPage.navigate(quizId);
        const result = await quizPage.attendFullQuiz(defaultAnswerProvider);

        attendedQuizIds.add(quizId);

        if (result.skippedAlreadyCompleted) {
          console.log(`[Runner] SKIPPED ALREADY-COMPLETED QUIZ: ${quizId}`);
          await quizPage.returnToDashboard();
          await dashboardPage.expectLoaded();
          continue;
        }

        expect(result.submissionConfirmed).toBe(true);
        totalBatchesCompleted++;

        console.log(`\n======================================================`);
        console.log(
          `[Runner] QUIZ COMPLETED & SUBMITTED: ${quizId} (${result.questionsAnswered} questions answered | Total quizzes completed this session: ${totalBatchesCompleted})`
        );
        console.log(`======================================================\n`);

        console.log('[Runner] Returning to dashboard (/student) to watch for the next quiz...');
        await quizPage.returnToDashboard();
        await dashboardPage.expectLoaded();
      }
    }
  });
});
