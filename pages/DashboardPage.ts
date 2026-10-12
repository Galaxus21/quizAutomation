import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class DashboardPage extends BasePage {
  readonly heading: Locator;
  readonly emptyState: Locator;
  readonly quizCards: Locator;
  readonly assignmentsLoadingSpinner: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /My quizzes/i });
    this.emptyState = page.locator('text=Nothing assigned yet');
    this.quizCards = page.locator('main').locator('article, .rounded-2xl');
    this.assignmentsLoadingSpinner = page.locator('text=Loading your assignments');
  }

  async navigate(): Promise<void> {
    console.log('[Dashboard] Navigating to student dashboard (/student)...');
    await this.page.goto('/student');
    await this.waitForSessionReady();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.navQuizzes).toBeVisible();
    await expect(this.navClasses).toBeVisible();
    await expect(this.navResults).toBeVisible();
    console.log('[Dashboard] Student dashboard loaded and verified.');
  }

  async waitForAssignmentsLoaded(timeoutMs: number = 15000): Promise<void> {
    await this.waitForSessionReady(timeoutMs);
    await expect(this.assignmentsLoadingSpinner).toHaveCount(0, { timeout: timeoutMs });
  }

  /** Returns assignment IDs already in a terminal state in /api/v1/results/me. */
  private async fetchAlreadyFinishedQuizIds(): Promise<string[]> {
    try {
      return await this.page.evaluate(async () => {
        const terminalStatuses = new Set(['SUBMITTED', 'AUTO_SUBMITTED', 'EXPIRED', 'VOIDED']);
        const accessKey = Object.keys(window.sessionStorage).find((k) => k.endsWith('.access'));
        const token = accessKey ? window.sessionStorage.getItem(accessKey) : null;
        const apiOrigin = window.location.origin.replace('://www.', '://api.');
        const res = await fetch(`${apiOrigin}/api/v1/results/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          credentials: 'include',
        });
        if (!res.ok) return [];
        const data = (await res.json()) as {
          items?: Array<{ assignment_id?: string; status?: string }>;
        };
        return (data.items ?? [])
          .filter((item) => item.assignment_id && item.status && terminalStatuses.has(item.status))
          .map((item) => item.assignment_id as string);
      });
    } catch {
      return [];
    }
  }

  /** Returns unattended OPEN quiz IDs currently on the dashboard. */
  async getOpenQuizIds(excludeQuizIds: Set<string> = new Set()): Promise<string[]> {
    await this.waitForAssignmentsLoaded();
    const openLinks = this.page.locator('a[href^="/student/sit/"]');
    const count = await openLinks.count();
    const candidateIds: string[] = [];

    for (let i = 0; i < count; i++) {
      const href = await openLinks.nth(i).getAttribute('href');
      if (href) {
        const idMatch = href.match(/\/student\/sit\/([^/?#]+)/);
        const id = idMatch?.[1];
        if (id && !candidateIds.includes(id) && !excludeQuizIds.has(id)) {
          candidateIds.push(id);
        }
      }
    }

    if (candidateIds.length > 0) {
      const finishedIds = await this.fetchAlreadyFinishedQuizIds();
      for (const finishedId of finishedIds) {
        if (!excludeQuizIds.has(finishedId)) {
          excludeQuizIds.add(finishedId);
          if (candidateIds.includes(finishedId)) {
            console.log(
              `[Dashboard] Skipping open quiz ${finishedId} (already submitted/completed in /results/me).`
            );
          }
        }
      }
    }

    return candidateIds.filter((id) => !excludeQuizIds.has(id));
  }

  async getFirstOpenQuizId(excludeQuizIds: Set<string> = new Set()): Promise<string | null> {
    const ids = await this.getOpenQuizIds(excludeQuizIds);
    return ids.length > 0 ? ids[0] : null;
  }

  /** Polls and reloads the dashboard at random intervals until a new open quiz appears. */
  async pollForOpenQuiz(
    minIntervalMs: number = 5000,
    maxIntervalMs: number = 15000,
    excludeQuizIds: Set<string> = new Set()
  ): Promise<string[]> {
    const startTime = Date.now();
    let attempt = 1;

    console.log(
      `\n[Dashboard] Searching for new active OPEN quizzes on dashboard (infinite polling, random ${minIntervalMs / 1000}s–${maxIntervalMs / 1000}s interval)...`
    );

    while (true) {
      const quizIds = await this.getOpenQuizIds(excludeQuizIds);
      if (quizIds.length > 0) {
        console.log(
          `\n[Dashboard] QUIZ FOUND! Detected ${quizIds.length} new open quiz(zes): ${quizIds.join(', ')}`
        );
        return quizIds;
      }

      const delayMs = Math.floor(Math.random() * (maxIntervalMs - minIntervalMs + 1)) + minIntervalMs;
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      const attendedNote =
        excludeQuizIds.size > 0 ? ` (${excludeQuizIds.size} quiz(zes) already completed)` : '';
      console.log(
        `[Dashboard] [Check #${attempt} | ${elapsedSec}s elapsed] No new open quiz active yet${attendedNote}. Waiting ${(delayMs / 1000).toFixed(1)}s and refreshing...`
      );
      await this.page.waitForTimeout(delayMs);
      await this.page.reload();
      attempt++;
    }
  }
}
