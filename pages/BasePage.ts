import { Page, Locator, expect } from '@playwright/test';

/**
 * BasePage: Encapsulates shared portal layout, navigation bar, and session status checks.
 */
export class BasePage {
  readonly page: Page;
  readonly sessionSpinner: Locator;
  readonly brandLogo: Locator;
  readonly navQuizzes: Locator;
  readonly navClasses: Locator;
  readonly navResults: Locator;
  readonly userBadge: Locator;
  readonly signOutButton: Locator;
  readonly installBannerDismissButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sessionSpinner = page.locator('text=Checking your session');
    this.brandLogo = page.locator('header a, nav a').first();
    this.navQuizzes = page.getByRole('link', { name: /My quizzes/i });
    this.navClasses = page.getByRole('link', { name: /My classes/i });
    this.navResults = page.getByRole('link', { name: /My results/i });
    this.userBadge = page.locator('header, nav, [role="banner"]').getByText(/STUDENT/i);
    this.signOutButton = page.getByRole('button', { name: /Sign out/i });
    this.installBannerDismissButton = page.getByRole('button', { name: /Dismiss|Not now/i });
  }

  async waitForSessionReady(timeoutMs: number = 15000): Promise<void> {
    await expect(this.sessionSpinner).toHaveCount(0, { timeout: timeoutMs });
  }

  async dismissInstallPromptIfVisible(): Promise<void> {
    if ((await this.installBannerDismissButton.count()) > 0 && (await this.installBannerDismissButton.first().isVisible())) {
      await this.installBannerDismissButton.first().click();
    }
  }
}
