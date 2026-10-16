import { test, expect } from '@playwright/test';
import { QuizPage } from '../pages/QuizPage';

test('skips an assignment that is already completed before pressing Begin', async ({ page }) => {
  await page.setContent(`
    <p>You have already completed this assignment.</p>
    <button>Begin</button>
  `);

  const quizPage = new QuizPage(page);
  const result = await quizPage.attendFullQuiz();

  expect(result).toEqual({ questionsAnswered: 0, submissionConfirmed: false, skippedAlreadyCompleted: true });
});

test('skips an assignment when the completion notice appears after Begin', async ({ page }) => {
  await page.setContent(`
    <button id="begin">Begin</button>
    <div id="message"></div>
    <script>
      document.querySelector('#begin').addEventListener('click', () => {
        document.querySelector('#message').textContent = 'You have already completed this assignment.';
      });
    </script>
  `);

  const quizPage = new QuizPage(page);
  const result = await quizPage.attendFullQuiz();

  expect(result).toEqual({ questionsAnswered: 0, submissionConfirmed: false, skippedAlreadyCompleted: true });
});
