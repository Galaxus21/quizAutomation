# Quiz Portal Automation

Playwright headful automation runner powered by `@google/genai` (`gemini-3.8-flash`).

## Setup

1. Install dependencies and browser:
   ```bash
   npm install
   npx playwright install chromium
   ```
2. Configure `.env`:
   ```bash
   cp .env.example .env
   ```
   ```env
   BASE_URL=https://your-exam-portal.example.com
   STUDENT_EMAIL=student@example.edu
   STUDENT_PASSWORD=your_password_here
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-3.8-flash
   ```

## Commands

| Command | Description |
| :--- | :--- |
| `npm start` | Logs in, polls `/student` every 5s–15s, attends and submits open quizzes, and repeats indefinitely. |
| `npm test` | Runs full test suite (navigation smoke tests + quiz runner). |
| `npm run report` | Opens the Playwright HTML report. |

## Project Structure

- [`tests/auth.setup.ts`](file:///c:/Users/verma/Documents/antigravity/busy-bohr/tests/auth.setup.ts) — Logs in via `/login` and saves session state to `.auth/`.
- [`fixtures/portal.fixture.ts`](file:///c:/Users/verma/Documents/antigravity/busy-bohr/fixtures/portal.fixture.ts) — Restores session state, sets geolocation, and suppresses blur/visibility/resize warnings.
- [`pages/DashboardPage.ts`](file:///c:/Users/verma/Documents/antigravity/busy-bohr/pages/DashboardPage.ts) — Polls `/student` at random 5s–15s intervals for unattended open quizzes.
- [`pages/QuizPage.ts`](file:///c:/Users/verma/Documents/antigravity/busy-bohr/pages/QuizPage.ts) — Starts/resumes quizzes, steps through questions, waits for auto-save, and submits.
- [`services/AnswerService.ts`](file:///c:/Users/verma/Documents/antigravity/busy-bohr/services/AnswerService.ts) — Extracts question context from DOM, resolves structured JSON answers via Gemini Interactions API, and fills inputs.
- [`tests/quiz-assessment.spec.ts`](file:///c:/Users/verma/Documents/antigravity/busy-bohr/tests/quiz-assessment.spec.ts) — Main infinite quiz polling and attendance loop.
