# Quiz Portal Automation

Playwright headful automation runner that uses OpenRouter to return validated JSON answers.

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
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   # Optional: defaults to OpenRouter's no-cost router.
   OPENROUTER_MODEL=openrouter/free
   ```

## Commands

| Command | Description |
| :--- | :--- |
| `npm start` | Logs in, polls `/student` every 5s–15s, completes available quizzes, and repeats indefinitely. |
| `npm run start:chrome` | Opens a new tab in a debug-enabled Chrome window and runs the same quiz loop without closing that tab. |
| `npm test` | Runs full test suite (navigation smoke tests + quiz runner). |
| `npm run report` | Opens the Playwright HTML report. |

## Project Structure

- `tests/auth.setup.ts` — Logs in via `/login` and saves session state to `.auth/`.
- `fixtures/portal.fixture.ts` — Restores session state and configures browser fixtures.
- `pages/DashboardPage.ts` — Polls `/student` at random 5s–15s intervals for unattended open quizzes.
- `pages/QuizPage.ts` — Starts/resumes quizzes, steps through questions, waits for auto-save, and submits.
- `services/AnswerService.ts` — Extracts question context, requests a schema-constrained answer from OpenRouter, validates it locally, and fills inputs.
- `tests/quiz-assessment.spec.ts` — Main infinite quiz polling and completion loop.

## OpenRouter configuration

The runner reads `OPENROUTER_API_KEY` only from `.env`; the file is ignored by Git. The default `OPENROUTER_MODEL=openrouter/free` uses OpenRouter's free-model router and selects a compatible free model for the JSON-schema response. You can set a specific OpenRouter model ID if preferred.

The runner retries transient model/API failures, rejects malformed or out-of-range answers, and never logs the API key. It requires valid `BASE_URL`, `STUDENT_EMAIL`, and `STUDENT_PASSWORD` values before a live run.

## Existing Chrome tab

Playwright's normal test mode launches an isolated browser and closes it when the test finishes. To keep the automation in a visible Chrome window, start a Chrome instance with remote debugging enabled, sign in there once, then run `npm run start:chrome`.

On macOS, start a dedicated automation Chrome profile with:

```bash
open -na "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir="$HOME/Library/Application Support/Google/Chrome-QuizAutomation"
```

The runner connects to `http://127.0.0.1:9222` by default and opens one new tab in that Chrome window. Set `CHROME_CDP_URL` in `.env` to use a different debugging endpoint.
