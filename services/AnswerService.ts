import { Page } from '@playwright/test';
import { GoogleGenAI } from '@google/genai';

export type QuestionType = 'MCQ_SINGLE' | 'MCQ_MULTI' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'NUMERIC';

export interface QuestionOption {
  index: number;   // 0-based index (0, 1, 2, 3)
  id: string;      // Backend option UUID from <input value="...">
  letter: string;  // Display badge ("A", "B", "C", "D")
  text: string;    // Clean option text from DOM
}

/**
 * Discriminated union of question contexts based on QuestionType.
 */
export type QuestionContext =
  | {
      questionNumber: number;
      type: 'MCQ_SINGLE';
      prompt: string;
      marks: string;
      options: QuestionOption[];
    }
  | {
      questionNumber: number;
      type: 'TRUE_FALSE';
      prompt: string;
      marks: string;
      options: QuestionOption[];
    }
  | {
      questionNumber: number;
      type: 'MCQ_MULTI';
      prompt: string;
      marks: string;
      options: QuestionOption[];
    }
  | {
      questionNumber: number;
      type: 'SHORT_ANSWER';
      prompt: string;
      marks: string;
    }
  | {
      questionNumber: number;
      type: 'NUMERIC';
      prompt: string;
      marks: string;
    };

/**
 * Fixed output answer structures strictly mapped to each QuestionType.
 */
export interface AnswerSchemaMap {
  MCQ_SINGLE: {
    type: 'MCQ_SINGLE';
    selectedOptionIndex: number;
  };
  TRUE_FALSE: {
    type: 'TRUE_FALSE';
    selectedOptionIndex: 0 | 1;
  };
  MCQ_MULTI: {
    type: 'MCQ_MULTI';
    selectedOptionIndices: number[];
  };
  SHORT_ANSWER: {
    type: 'SHORT_ANSWER';
    textAnswer: string;
  };
  NUMERIC: {
    type: 'NUMERIC';
    numericAnswer: number;
  };
}

export type TypedAnswerDecision<T extends QuestionType = QuestionType> = AnswerSchemaMap[T];

/** Returns the JSON schema corresponding to a QuestionContext. */
export function getAnswerJsonSchema(context: QuestionContext): Record<string, any> {
  switch (context.type) {
    case 'MCQ_SINGLE': {
      const maxIdx = Math.max(0, context.options.length - 1);
      return {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['MCQ_SINGLE'] },
          selectedOptionIndex: {
            type: 'integer',
            minimum: 0,
            maximum: maxIdx,
            description: `0-based index (0 to ${maxIdx}) of the single chosen option`,
          },
        },
        required: ['type', 'selectedOptionIndex'],
        additionalProperties: false,
      };
    }

    case 'TRUE_FALSE':
      return {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['TRUE_FALSE'] },
          selectedOptionIndex: {
            type: 'integer',
            enum: [0, 1],
            description: '0 for the first option, 1 for the second option',
          },
        },
        required: ['type', 'selectedOptionIndex'],
        additionalProperties: false,
      };

    case 'MCQ_MULTI': {
      const maxIdx = Math.max(0, context.options.length - 1);
      return {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['MCQ_MULTI'] },
          selectedOptionIndices: {
            type: 'array',
            minItems: 1,
            maxItems: Math.max(1, context.options.length),
            items: {
              type: 'integer',
              minimum: 0,
              maximum: maxIdx,
            },
            description: `Array of 0-based indices (0 to ${maxIdx}) for all applicable options`,
          },
        },
        required: ['type', 'selectedOptionIndices'],
        additionalProperties: false,
      };
    }

    case 'SHORT_ANSWER':
      return {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['SHORT_ANSWER'] },
          textAnswer: {
            type: 'string',
            description: 'Concise text response for the short answer prompt',
          },
        },
        required: ['type', 'textAnswer'],
        additionalProperties: false,
      };

    case 'NUMERIC':
      return {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['NUMERIC'] },
          numericAnswer: {
            type: 'number',
            description: 'Exact numeric value (integer or decimal)',
          },
        },
        required: ['type', 'numericAnswer'],
        additionalProperties: false,
      };
  }
}

export interface AnswerResult {
  type: QuestionType;
  context: QuestionContext;
  decision: TypedAnswerDecision;
  details: string;
}

export type AnswerResolver = (
  context: QuestionContext,
  jsonSchema: Record<string, any>
) => Promise<TypedAnswerDecision> | TypedAnswerDecision;

/** Extracts QuestionContext from DOM, resolves a typed answer via Gemini, and fills page controls. */
export class AnswerProvider {
  private resolver?: AnswerResolver;
  private ai?: GoogleGenAI;

  constructor(resolver?: AnswerResolver) {
    this.resolver = resolver;
  }

  private getAiClient(): GoogleGenAI {
    if (!this.ai) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('[AnswerProvider] GEMINI_API_KEY is not set in .env');
      }
      this.ai = new GoogleGenAI({ apiKey });
    }
    return this.ai;
  }

  async extractQuestionContext(page: Page): Promise<QuestionContext> {
    await page.waitForSelector('p.text-lg, p.sm\\:text-xl, fieldset, textarea, input[type="number"]', {
      timeout: 15000,
    });

    let questionNumber = 1;
    const activeBtn = page.locator('button[aria-current="true"]');
    if ((await activeBtn.count()) > 0) {
      const ariaLabel = await activeBtn.getAttribute('aria-label');
      const match = ariaLabel?.match(/Question\s+(\d+)/i);
      if (match) questionNumber = parseInt(match[1], 10);
    }

    // 2. Prompt Text
    const promptLocator = page.locator('p.text-lg, p.sm\\:text-xl').first();
    const prompt = (await promptLocator.count()) > 0 ? (await promptLocator.innerText()).trim() : '';

    // 3. Marks Badge
    const marksLocator = page.locator('span.bg-brand-50').first();
    const marks = (await marksLocator.count()) > 0 ? (await marksLocator.innerText()).trim() : '';

    // 4. Radio / True-False Controls
    const radioLabels = page.locator('fieldset label:has(input[type="radio"]), label:has(input[type="radio"])');
    const radioCount = await radioLabels.count();

    if (radioCount > 0) {
      const options: QuestionOption[] = [];
      for (let i = 0; i < radioCount; i++) {
        const label = radioLabels.nth(i);
        const input = label.locator('input[type="radio"]');
        const letterSpan = label.locator('span[aria-hidden="true"]').first();
        const textSpan = label.locator('span.text-base').first();

        const id = (await input.getAttribute('value')) || String(i);
        const letter = (await letterSpan.count()) > 0 ? (await letterSpan.innerText()).trim() : String.fromCharCode(65 + i);
        const text = (await textSpan.count()) > 0 ? (await textSpan.innerText()).trim() : (await label.innerText()).trim();

        options.push({ index: i, id, letter, text });
      }

      const isTrueFalse =
        options.length === 2 &&
        options.some((o) => /^true$/i.test(o.text)) &&
        options.some((o) => /^false$/i.test(o.text));

      return {
        questionNumber,
        type: isTrueFalse ? 'TRUE_FALSE' : 'MCQ_SINGLE',
        prompt,
        marks,
        options,
      };
    }

    // 5. Multi-select Checkbox Controls
    const checkboxLabels = page.locator('fieldset label:has(input[type="checkbox"]), label:has(input[type="checkbox"])');
    const checkboxCount = await checkboxLabels.count();

    if (checkboxCount > 0) {
      const options: QuestionOption[] = [];
      for (let i = 0; i < checkboxCount; i++) {
        const label = checkboxLabels.nth(i);
        const input = label.locator('input[type="checkbox"]');
        const letterSpan = label.locator('span[aria-hidden="true"]').first();
        const textSpan = label.locator('span.text-base').first();

        const id = (await input.getAttribute('value')) || String(i);
        const letter = (await letterSpan.count()) > 0 ? (await letterSpan.innerText()).trim() : String.fromCharCode(65 + i);
        const text = (await textSpan.count()) > 0 ? (await textSpan.innerText()).trim() : (await label.innerText()).trim();

        options.push({ index: i, id, letter, text });
      }

      return {
        questionNumber,
        type: 'MCQ_MULTI',
        prompt,
        marks,
        options,
      };
    }

    // 6. Short Answer Textarea
    const textarea = page.locator('textarea');
    if ((await textarea.count()) > 0 && (await textarea.isVisible())) {
      return {
        questionNumber,
        type: 'SHORT_ANSWER',
        prompt,
        marks,
      };
    }

    // 7. Numeric Input
    return {
      questionNumber,
      type: 'NUMERIC',
      prompt,
      marks,
    };
  }

  /**
   * Resolves the strictly typed answer structure for the extracted QuestionContext.
   */
  async resolveAnswer(context: QuestionContext): Promise<TypedAnswerDecision> {
    const schema = getAnswerJsonSchema(context);

    if (this.resolver) {
      console.log(`  [AnswerProvider] Resolving answer via custom resolver...`);
      return await this.resolver(context, schema);
    }

    const ai = this.getAiClient();
    const model = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash';
    const maxAttempts = 3;

    const typeInstructions: Record<QuestionContext['type'], string> = {
      MCQ_SINGLE:
        'Exactly one option is correct. Return the zero-based index of that option in "selectedOptionIndex".',
      TRUE_FALSE:
        'Decide whether the statement is true or false, then return the zero-based index of the matching option in "selectedOptionIndex". Do not assume option order; read the option labels.',
      MCQ_MULTI:
        'One or more options are correct. Return the zero-based indices of every correct option, and no incorrect ones, in "selectedOptionIndices" (ascending order, no duplicates, at least one).',
      SHORT_ANSWER:
        'Return the shortest complete correct answer in "textAnswer". Plain text only: no preamble, no explanation, no restating the question.',
      NUMERIC:
        'Return the final numeric result as a JSON number in "numericAnswer". No units, no thousands separators, no text.',
    };

    const systemInstruction = [
      'You are an expert answering a single question.',
      '',
      'Rules:',
      '1. Use only the question and options provided, plus well-established general knowledge.',
      '2. Never invent facts, options, or context that are not given.',
      '3. Work through the problem carefully and verify your result before answering.',
      '4. Always commit to the single most likely correct answer. Never refuse, hedge, or ask for clarification.',
      '5. Indices are zero-based and refer to the options in the exact order provided.',
      '6. The "type" field of your JSON output must equal the question type given.',
    ].join('\n');

    const userPrompt = [
      `Question type: ${context.type}`,
      `Task: ${typeInstructions[context.type]}`,
      '',
      'Question:',
      JSON.stringify(context),
    ].join('\n');

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`  [AnswerProvider] Querying model "${model}" for Q#${context.questionNumber} (attempt ${attempt}/${maxAttempts})...`);
        const interaction = await ai.interactions.create({
          model,
          input: userPrompt,
          system_instruction: systemInstruction,
          store: false,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema,
          },
        });

        const text = interaction.output_text;
        if (!text) {
          throw new Error('Gemini returned no content');
        }

        const parsed = JSON.parse(text);
        const decision = { type: context.type, ...parsed } as TypedAnswerDecision;
        console.log(`  [AnswerProvider] Decision received: ${JSON.stringify(decision)}`);
        return decision;
      } catch (err) {
        lastError = err;
        console.warn(
          `  [AnswerProvider] Attempt ${attempt}/${maxAttempts} failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        );

        const status = (err as { status?: number }).status;
        const retryable = status === undefined || status === 429 || status >= 500;
        if (!retryable) break;

        if (attempt < maxAttempts) {
          const delayMs = 1000 * 2 ** (attempt - 1);
          console.log(`  [AnswerProvider] Retrying in ${delayMs / 1000}s...`);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    throw new Error(
      `Failed to resolve answer via Gemini: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    );
  }

  /**
   * Orchestrates DOM extraction, deterministic resolution, and applying the answer to the UI.
   */
  async fillAnswer(page: Page): Promise<AnswerResult> {
    const context = await this.extractQuestionContext(page);

    console.log(`\n------------------------------------------------------`);
    console.log(`[Question #${context.questionNumber}] Type: ${context.type} | Marks: ${context.marks || 'N/A'}`);
    console.log(`  Prompt : "${context.prompt}"`);
    if ('options' in context && context.options.length > 0) {
      for (const opt of context.options) {
        console.log(`  Option [${opt.index}] (${opt.letter}): "${opt.text}"`);
      }
    }

    const decision = await this.resolveAnswer(context);

    // 1. Single Choice Radio / True-False
    if (
      (context.type === 'MCQ_SINGLE' || context.type === 'TRUE_FALSE') &&
      (decision.type === 'MCQ_SINGLE' || decision.type === 'TRUE_FALSE')
    ) {
      const radioLabels = page.locator('fieldset label:has(input[type="radio"]), label:has(input[type="radio"])');
      const targetIndex =
        decision.selectedOptionIndex >= 0 && decision.selectedOptionIndex < context.options.length
          ? decision.selectedOptionIndex
          : 0;

      const chosenLabel = radioLabels.nth(targetIndex);
      await chosenLabel.scrollIntoViewIfNeeded();
      await chosenLabel.click();

      const radioInput = chosenLabel.locator('input[type="radio"]');
      if ((await radioInput.count()) > 0 && !(await radioInput.isChecked())) {
        await radioInput.check({ force: true });
      }

      const chosenOpt = context.options[targetIndex];
      const details = `Selected Option [${targetIndex}] (${chosenOpt?.letter}): "${chosenOpt?.text}"`;
      console.log(`  [Action] ${details}`);
      return {
        type: context.type,
        context,
        decision,
        details,
      };
    }

    // 2. Multi-select Checkboxes
    if (context.type === 'MCQ_MULTI' && decision.type === 'MCQ_MULTI') {
      const checkboxLabels = page.locator('fieldset label:has(input[type="checkbox"]), label:has(input[type="checkbox"])');
      const selectedSet = new Set(
        decision.selectedOptionIndices.filter((idx) => idx >= 0 && idx < context.options.length)
      );
      if (selectedSet.size === 0 && context.options.length > 0) {
        selectedSet.add(0);
      }

      const pickedSummary: string[] = [];
      for (let idx = 0; idx < context.options.length; idx++) {
        const cbLabel = checkboxLabels.nth(idx);
        const cbInput = cbLabel.locator('input[type="checkbox"]');
        const isCurrentlyChecked = (await cbInput.count()) > 0 ? await cbInput.isChecked() : false;
        const shouldBeChecked = selectedSet.has(idx);

        if (shouldBeChecked && !isCurrentlyChecked) {
          await cbLabel.scrollIntoViewIfNeeded();
          await cbLabel.click();
          if ((await cbInput.count()) > 0 && !(await cbInput.isChecked())) {
            await cbInput.check({ force: true });
          }
        } else if (!shouldBeChecked && isCurrentlyChecked) {
          await cbLabel.scrollIntoViewIfNeeded();
          await cbLabel.click();
        }

        if (shouldBeChecked) {
          const opt = context.options[idx];
          pickedSummary.push(`[${idx}] (${opt.letter}) "${opt.text}"`);
        }
      }

      const details = `Selected Checkboxes: ${pickedSummary.join(', ')}`;
      console.log(`  [Action] ${details}`);
      return {
        type: 'MCQ_MULTI',
        context,
        decision,
        details,
      };
    }

    // 3. Short Answer Textarea
    if (context.type === 'SHORT_ANSWER' && decision.type === 'SHORT_ANSWER') {
      const textarea = page.locator('textarea');
      await textarea.fill(decision.textAnswer);
      console.log(`  [Action] Typed short answer: "${decision.textAnswer}" (waiting 850ms for auto-save...)`);
      await page.waitForTimeout(850); // Portal 800ms debounce flush

      return {
        type: 'SHORT_ANSWER',
        context,
        decision,
        details: `Entered text: "${decision.textAnswer}"`,
      };
    }

    // 4. Numeric Input
    if (context.type === 'NUMERIC' && decision.type === 'NUMERIC') {
      const numberInput = page.locator('input[type="number"]');
      await numberInput.fill(String(decision.numericAnswer));
      console.log(`  [Action] Typed numeric answer: ${decision.numericAnswer} (waiting 850ms for auto-save...)`);
      await page.waitForTimeout(850); // Portal 800ms debounce flush

      return {
        type: 'NUMERIC',
        context,
        decision,
        details: `Entered number: ${decision.numericAnswer}`,
      };
    }

    throw new Error(
      `AnswerDecision type "${decision.type}" did not match QuestionContext type "${context.type}"`
    );
  }
}

// Single default instance
export const defaultAnswerProvider = new AnswerProvider();
export const defaultAnswerService = defaultAnswerProvider;
