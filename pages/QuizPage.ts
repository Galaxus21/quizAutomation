import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';
import { AnswerProvider, defaultAnswerProvider, AnswerResult } from '../services/AnswerService';

export class QuizPage extends BasePage {
  readonly loadingQuizSpinner: Locator;
  readonly startButton: Locator;
  readonly nextButton: Locator;
  readonly previousButton: Locator;
  readonly reviewButton: Locator;
  readonly submitModal: Locator;
  readonly modalSubmitButton: Locator;
  readonly modalKeepWorkingButton: Locator;
  readonly submittedHeading: Locator;
  readonly backToQuizzesButton: Locator;
  readonly questionButtons: Locator;
  readonly activeQuestionButton: Locator;
  readonly savingStatusBadge: Locator;
  readonly alreadyCompletedNotice: Locator;

  constructor(page: Page) {
    super(page);
    this.loadingQuizSpinner = page.locator('text=Loading your quiz');
    this.startButton = page.getByRole('button', { name: /Begin|Start|Allow location and start/i });
    this.nextButton = page.getByRole('button', { name: 'Next' });
    this.previousButton = page.getByRole('button', { name: 'Previous' });
    this.reviewButton = page.getByRole('button', { name: 'Review and submit' });
    this.submitModal = page.locator('[role="dialog"]');
    this.modalSubmitButton = this.submitModal.getByRole('button', { name: 'Submit' });
    this.modalKeepWorkingButton = this.submitModal.getByRole('button', { name: 'Keep working' });
    this.submittedHeading = page.getByRole('heading', {
      name: /Your answers have been submitted|Your attempt was submitted automatically/i,
    });
    this.backToQuizzesButton = page.getByRole('button', { name: /Back to my quizzes/i });
    this.questionButtons = page.locator('button[aria-label^="Question "]');
    this.activeQuestionButton = page.locator('button[aria-current="true"]');
    this.savingStatusBadge = page.locator('[role="status"]', { hasText: 'Saving' });
    this.alreadyCompletedNotice = page.getByText(/you have already completed this assignment/i);
  }

  async navigate(assignmentId: string): Promise<void> {
    console.log(`[Quiz UI] Navigating to assessment sitting page (/student/sit/${assignmentId})...`);
    await this.page.goto(`/student/sit/${assignmentId}`);
    await this.waitForSessionReady();
    await expect(this.loadingQuizSpinner).toHaveCount(0, { timeout: 20000 });
    console.log(`[Quiz UI] Assessment page loaded for ID: ${assignmentId}`);
  }

  /** Starts the quiz or resumes an existing IN_PROGRESS session. */
  /** Starts or resumes a quiz. Returns a terminal state when the assignment is already completed. */
  async beginQuiz(): Promise<'started' | 'alreadyCompleted'> {
    await expect(this.loadingQuizSpinner).toHaveCount(0, { timeout: 20000 });

    if (await this.alreadyCompletedNotice.isVisible()) {
      console.log('[Quiz UI] Assignment is already completed; skipping it.');
      return 'alreadyCompleted';
    }

    if ((await this.questionButtons.count()) > 0) {
      console.log('[Quiz UI] Active IN_PROGRESS session detected! Resuming directly at questions UI.');
      return 'started';
    }

    await expect(this.startButton).toBeVisible({ timeout: 15000 });
    const btnText = (await this.startButton.innerText()).trim();
    console.log(`[Quiz UI] Clicking "${btnText}" button to start quiz attempt...`);
    await this.startButton.click();

    await expect
      .poll(
        async () =>
          (await this.questionButtons.count()) > 0 || (await this.alreadyCompletedNotice.isVisible()),
        { timeout: 20000 }
      )
      .toBe(true);

    if (await this.alreadyCompletedNotice.isVisible()) {
      console.log('[Quiz UI] Server marked the assignment as already completed after Begin; skipping it.');
      return 'alreadyCompleted';
    }

    await expect(this.questionButtons.first()).toBeVisible({ timeout: 20000 });
    await this.page.waitForSelector(
      'p.whitespace-pre-wrap, fieldset, textarea, input[type="number"]',
      { timeout: 20000 }
    );
    console.log('[Quiz UI] Quiz session started! First question mounted on screen.');
    return 'started';
  }

  async getTotalQuestionsCount(): Promise<number> {
    const count = await this.questionButtons.count();
    return count > 0 ? count : 1;
  }

  async getCurrentQuestionNumber(): Promise<number> {
    if ((await this.activeQuestionButton.count()) > 0) {
      const label = await this.activeQuestionButton.getAttribute('aria-label');
      const match = label?.match(/Question\s+(\d+)/i);
      if (match) return parseInt(match[1], 10);
    }
    return 1;
  }

  async waitForAnswerSaved(timeoutMs: number = 10000): Promise<void> {
    await this.page.waitForTimeout(300);
    await expect(this.savingStatusBadge).toHaveCount(0, { timeout: timeoutMs });
  }

  async answerQuestion(answerProvider: AnswerProvider = defaultAnswerProvider): Promise<AnswerResult> {
    const result = await answerProvider.fillAnswer(this.page);
    await this.waitForAnswerSaved();
    return result;
  }

  async clickNext(): Promise<void> {
    await expect(this.nextButton).toBeVisible({ timeout: 10000 });
    const currentQuestionNumber = await this.getCurrentQuestionNumber();
    console.log(`  [Navigation] Clicking "Next" -> advancing to next question...`);
    await this.nextButton.click();
    await expect.poll(() => this.getCurrentQuestionNumber(), { timeout: 10000 }).not.toBe(currentQuestionNumber);
  }

  async clickReviewAndSubmit(): Promise<void> {
    await this.waitForAnswerSaved();
    await expect(this.reviewButton).toBeVisible({ timeout: 10000 });
    console.log(`\n[Submission] Clicking "Review and submit" button...`);
    await this.reviewButton.click();
  }

  async expectSubmitModalVisible(): Promise<void> {
    await expect(this.submitModal).toBeVisible({ timeout: 10000 });
    await expect(this.submitModal.locator('text=Submit your answers?')).toBeVisible();
    const modalText = (await this.submitModal.locator('p').first().innerText().catch(() => '')).trim();
    console.log(`[Submission] Confirmation modal opened: "Submit your answers?" (${modalText})`);
  }

  async dismissSubmitModal(): Promise<void> {
    await expect(this.modalKeepWorkingButton).toBeVisible();
    console.log('[Submission] Clicking "Keep working" to dismiss modal...');
    await this.modalKeepWorkingButton.click();
    await expect(this.submitModal).not.toBeVisible();
  }

  async confirmFinalSubmission(): Promise<void> {
    await expect(this.modalSubmitButton).toBeVisible({ timeout: 10000 });
    console.log('[Submission] Clicking "Submit" inside confirmation modal...');
    await this.modalSubmitButton.click();
  }

  async expectSubmissionConfirmed(): Promise<void> {
    await expect(this.submittedHeading).toBeVisible({ timeout: 20000 });
    const headingText = (await this.submittedHeading.innerText()).trim();
    console.log(`[Submission] SUBMISSION CONFIRMED BY SERVER: "${headingText}"`);
  }

  async returnToDashboard(): Promise<void> {
    if (await this.backToQuizzesButton.isVisible()) {
      console.log('[Quiz UI] Clicking "Back to my quizzes" button to return to dashboard...');
      await this.backToQuizzesButton.click();
      await this.page.waitForURL('**/student', { timeout: 15000 });
      await this.waitForSessionReady();
    } else {
      await this.page.goto('/student');
      await this.waitForSessionReady();
    }
  }

  /** Attends the full quiz from start through final submission. */
  async attendFullQuiz(
    answerProvider: AnswerProvider = defaultAnswerProvider
  ): Promise<{ questionsAnswered: number; submissionConfirmed: boolean; skippedAlreadyCompleted: boolean }> {
    const beginResult = await this.beginQuiz();
    if (beginResult === 'alreadyCompleted') {
      return { questionsAnswered: 0, submissionConfirmed: false, skippedAlreadyCompleted: true };
    }

    const totalQuestions = await this.getTotalQuestionsCount();
    console.log(`[Quiz UI] Total questions detected in palette: ${totalQuestions}`);

    let questionsAnswered = 0;
    let reviewStarted = false;

    for (let questionIndex = 0; questionIndex < totalQuestions; questionIndex++) {
      questionsAnswered++;
      const currentNum = await this.getCurrentQuestionNumber();
      console.log(`\n[Quiz UI] Attempting Question ${currentNum} of ${totalQuestions}...`);

      const answer = await this.answerQuestion(answerProvider);
      console.log(
        `  [Confirmed] Q#${currentNum}/${totalQuestions} (${answer.type}) -> ${answer.details}`
      );

      // The final question can expose both controls briefly; review takes priority.
      if (await this.reviewButton.isVisible()) {
        console.log(`\n[Quiz UI] All ${totalQuestions} questions answered! Proceeding to submission...`);
        await this.clickReviewAndSubmit();
        reviewStarted = true;
        break;
      } else if (await this.nextButton.isVisible()) {
        await this.clickNext();
      } else {
        // Fallback safety check if neither button is visible immediately
        await this.page.waitForTimeout(500);
        if (await this.reviewButton.isVisible()) {
          await this.clickReviewAndSubmit();
          reviewStarted = true;
          break;
        }
        if (await this.nextButton.isVisible()) {
          await this.clickNext();
          continue;
        }
        throw new Error('[Quiz UI] Could not find a next or review-and-submit control after answering a question');
      }
    }

    if (!reviewStarted) {
      throw new Error(`[Quiz UI] Reached the ${totalQuestions}-question limit without reaching submission`);
    }

    // Modal confirmation
    await this.expectSubmitModalVisible();
    await this.confirmFinalSubmission();
    await this.expectSubmissionConfirmed();

    return { questionsAnswered, submissionConfirmed: true, skippedAlreadyCompleted: false };
  }
}
