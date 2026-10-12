import { test, expect } from '../fixtures/portal.fixture';

test.describe('Portal Navigation & Smoke Validation', () => {
  test('TC-NAV-01: Student dashboard loads with user context', async ({ dashboardPage }) => {
    await dashboardPage.navigate();
    await dashboardPage.expectLoaded();
  });

  test('TC-NAV-02: Classes directory and course detail view render correctly', async ({ classesPage }) => {
    await classesPage.navigate();
    await classesPage.openCourse('CS441');
    await classesPage.expectCourseDetailLoaded('Generative AI');
  });

  test('TC-NAV-03: Results page loads without infinite spinner', async ({ resultsPage }) => {
    await resultsPage.navigate();
    await resultsPage.expectLoaded();
  });
});
