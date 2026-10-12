import { test as base, expect } from '@playwright/test';
import { setupSessionAuth } from './auth';
import { DashboardPage } from '../pages/DashboardPage';
import { ClassesPage } from '../pages/ClassesPage';
import { ResultsPage } from '../pages/ResultsPage';
import { QuizPage } from '../pages/QuizPage';

type PortalFixtures = {
  dashboardPage: DashboardPage;
  classesPage: ClassesPage;
  resultsPage: ResultsPage;
  quizPage: QuizPage;
};

export const test = base.extend<PortalFixtures>({
  page: async ({ page, context }, use) => {
    await context.setGeolocation({ latitude: 12.9715987, longitude: 77.5945627, accuracy: 10 });
    await context.grantPermissions(['geolocation']);

    // Suppress focus, fullscreen, and resize proctoring events in headful mode
    await page.addInitScript(() => {
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
      Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
      Object.defineProperty(document, 'fullscreenElement', {
        get: () => document.documentElement,
        configurable: true,
      });
      document.hasFocus = () => true;

      Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth, configurable: true });
      Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight + 80, configurable: true });

      const blockedEvents = new Set(['blur', 'visibilitychange', 'fullscreenchange', 'beforeprint']);
      const origWinAdd = window.addEventListener.bind(window);
      const origDocAdd = document.addEventListener.bind(document);

      window.addEventListener = function (type: string, listener: any, options?: any) {
        if (blockedEvents.has(type)) return;
        return origWinAdd(type, listener, options);
      };

      document.addEventListener = function (type: string, listener: any, options?: any) {
        if (blockedEvents.has(type)) return;
        return origDocAdd(type, listener, options);
      };
    });

    await setupSessionAuth(page);
    await use(page);
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  classesPage: async ({ page }, use) => {
    await use(new ClassesPage(page));
  },

  resultsPage: async ({ page }, use) => {
    await use(new ResultsPage(page));
  },

  quizPage: async ({ page }, use) => {
    await use(new QuizPage(page));
  },
});

export { expect };
