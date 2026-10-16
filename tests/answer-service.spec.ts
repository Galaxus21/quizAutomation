import { test, expect } from '@playwright/test';
import { AnswerProvider, QuestionContext } from '../services/AnswerService';

const singleChoiceQuestion: QuestionContext = {
  questionNumber: 1,
  type: 'MCQ_SINGLE',
  prompt: 'What is 2 + 2?',
  marks: '1 mark',
  options: [
    { index: 0, id: 'a', letter: 'A', text: '3' },
    { index: 1, id: 'b', letter: 'B', text: '4' },
  ],
};

test.describe('AnswerProvider OpenRouter integration', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const originalModel = process.env.OPENROUTER_MODEL;

  test.beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.OPENROUTER_MODEL = 'openrouter/free';
  });

  test.afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = originalModel;
  });

  test('sends a schema-constrained OpenRouter request and accepts a valid response', async () => {
    let request: Request | undefined;
    global.fetch = async (input, init) => {
      request = new Request(input, init);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ type: 'MCQ_SINGLE', selectedOptionIndex: 1 }) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const answer = await new AnswerProvider().resolveAnswer(singleChoiceQuestion);

    expect(answer).toEqual({ type: 'MCQ_SINGLE', selectedOptionIndex: 1 });
    expect(request?.headers.get('Authorization')).toBe('Bearer test-key');
    const body = await request?.json();
    expect(body).toMatchObject({
      model: 'openrouter/free',
      response_format: { type: 'json_schema', json_schema: { name: 'quiz_answer', strict: true } },
    });
  });

  test('rejects an out-of-range model answer before it reaches the browser', async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ type: 'MCQ_SINGLE', selectedOptionIndex: 9 }) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );

    await expect(new AnswerProvider().resolveAnswer(singleChoiceQuestion)).rejects.toThrow(
      'invalid selectedOptionIndex'
    );
  });

  test('extracts and fills a single-choice question', async ({ page }) => {
    await page.setContent(`
      <button aria-current="true" aria-label="Question 1">1</button>
      <p class="text-lg">Which option is correct?</p>
      <fieldset>
        <label><span aria-hidden="true">A</span><span class="text-base">Incorrect</span><input type="radio" value="a" name="q1"></label>
        <label><span aria-hidden="true">B</span><span class="text-base">Correct</span><input type="radio" value="b" name="q1"></label>
      </fieldset>
    `);
    const provider = new AnswerProvider((context) => {
      expect(context).toMatchObject({ type: 'MCQ_SINGLE', questionNumber: 1 });
      return { type: 'MCQ_SINGLE', selectedOptionIndex: 1 };
    });

    await provider.fillAnswer(page);

    await expect(page.locator('input[value="b"]')).toBeChecked();
  });

  test('extracts and fills every applicable multi-choice option', async ({ page }) => {
    await page.setContent(`
      <button aria-current="true" aria-label="Question 2">2</button>
      <p class="whitespace-pre-wrap">Select all prime numbers.</p>
      <fieldset>
        <label><span aria-hidden="true">A</span><span class="text-base">2</span><input type="checkbox" value="a"></label>
        <label><span aria-hidden="true">B</span><span class="text-base">4</span><input type="checkbox" value="b"></label>
        <label><span aria-hidden="true">C</span><span class="text-base">5</span><input type="checkbox" value="c"></label>
      </fieldset>
    `);
    const provider = new AnswerProvider(() => ({ type: 'MCQ_MULTI', selectedOptionIndices: [0, 2] }));

    await provider.fillAnswer(page);

    await expect(page.locator('input[value="a"]')).toBeChecked();
    await expect(page.locator('input[value="b"]')).not.toBeChecked();
    await expect(page.locator('input[value="c"]')).toBeChecked();
  });

  test('extracts and fills text and numeric answers', async ({ page }) => {
    await page.setContent(`
      <button aria-current="true" aria-label="Question 3">3</button>
      <p class="text-lg">Name this value.</p>
      <textarea></textarea>
    `);
    await new AnswerProvider(() => ({ type: 'SHORT_ANSWER', textAnswer: 'Answer' })).fillAnswer(page);
    await expect(page.locator('textarea')).toHaveValue('Answer');

    await page.setContent(`
      <button aria-current="true" aria-label="Question 4">4</button>
      <p class="text-lg">What is the result?</p>
      <input type="number">
    `);
    await new AnswerProvider(() => ({ type: 'NUMERIC', numericAnswer: 42 })).fillAnswer(page);
    await expect(page.locator('input[type="number"]')).toHaveValue('42');
  });
});
