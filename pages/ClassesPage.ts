import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class ClassesPage extends BasePage {
  readonly heading: Locator;
  readonly classesMetric: Locator;
  readonly openNowMetric: Locator;

  constructor(page: Page) {
    super(page);
    this.heading = page.getByRole('heading', { name: /My classes/i });
    this.classesMetric = page.getByText('Classes', { exact: true });
    this.openNowMetric = page.getByText('Open now', { exact: true });
  }

  async navigate(): Promise<void> {
    await this.page.goto('/student/classes');
    await this.waitForSessionReady();
  }

  getCourseRow(codeOrTitle: string): Locator {
    return this.page
      .locator('tr, li')
      .filter({ hasText: codeOrTitle })
      .filter({ visible: true })
      .first();
  }

  async openCourse(codeOrTitle: string): Promise<void> {
    const row = this.getCourseRow(codeOrTitle);
    await expect(row).toBeVisible();
    await row.click();
    await this.page.waitForURL(/\/student\/classes\/[a-zA-Z0-9-]+/);
  }

  async expectCourseDetailLoaded(courseTitle: string): Promise<void> {
    await expect(this.page.getByRole('heading', { name: new RegExp(courseTitle, 'i') })).toBeVisible();
    await expect(this.page.getByText('Quizzes', { exact: true })).toBeVisible();
    await expect(this.page.getByText('Attendance', { exact: true })).toBeVisible();
  }
}
