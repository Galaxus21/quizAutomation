import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ResultsPage extends BasePage {
  readonly heading: Locator;
  readonly attemptsMetric: Locator;
  readonly marksReleasedMetric: Locator;
  readonly averageMetric: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /My results/i });
    this.attemptsMetric = page.getByText('Attempts', { exact: true });
    this.marksReleasedMetric = page.getByText('Marks released', { exact: true });
    this.averageMetric = page.getByText('Average', { exact: true });
  }

  async navigate(): Promise<void> {
    await this.page.goto('/student/results');
    await this.waitForSessionReady();
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
    await expect(this.attemptsMetric).toBeVisible();
    await expect(this.marksReleasedMetric).toBeVisible();
  }
}
