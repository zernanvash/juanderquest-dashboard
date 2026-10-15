import { describe, expect, it } from 'vitest';
import { createEmptyQuizDraft, toQuizPayload, validateQuizDraft } from './quizDraft';

describe('quiz draft validation', () => {
  it('reports missing basics on an empty draft', () => {
    const errors = validateQuizDraft(createEmptyQuizDraft());
    expect(errors).toContain('Choose a published destination.');
    expect(errors).toContain('Title must be at least 3 characters.');
    expect(errors).toContain('Description must be at least 10 characters.');
  });

  it('requires exactly one correct answer per question', () => {
    const draft = createEmptyQuizDraft();
    draft.destinationId = 'spot-1';
    draft.title = 'Cape Bolinao Stories';
    draft.description = 'A quiz about the cape and its coastal heritage.';
    draft.questions = draft.questions.map((question, index) => ({
      questionText: `Question ${index + 1}?`,
      explanation: 'Because the source confirms it.',
      sourceUrl: '',
      options: [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: true },
        { text: 'C', isCorrect: false },
        { text: 'D', isCorrect: false },
      ],
    }));

    const errors = validateQuizDraft(draft);
    expect(errors.filter((error) => error.includes('mark exactly one correct answer'))).toHaveLength(5);
  });

  it('accepts a complete draft and maps it to the API payload', () => {
    const draft = createEmptyQuizDraft();
    draft.destinationId = 'spot-1';
    draft.title = 'Cape Bolinao Stories';
    draft.description = 'A quiz about the cape and its coastal heritage.';
    draft.language = 'fil';
    draft.radiusMeters = 300;
    draft.xpReward = 40;
    draft.timeLimitMinutes = 20;
    draft.cooldownHours = 48;
    draft.questions = draft.questions.map((question, index) => ({
      questionText: `Question ${index + 1}?`,
      explanation: 'Because the source confirms it.',
      sourceUrl: 'https://example.com/source',
      options: [
        { text: 'A', isCorrect: false },
        { text: 'B', isCorrect: true },
        { text: 'C', isCorrect: false },
        { text: 'D', isCorrect: false },
      ],
    }));

    expect(validateQuizDraft(draft)).toEqual([]);

    const payload = toQuizPayload(draft);
    expect(payload).toMatchObject({
      destination_id: 'spot-1',
      language: 'fil',
      radius_meters: 300,
      xp_reward: 40,
      time_limit_minutes: 20,
      cooldown_hours: 48,
    });
    expect(payload.questions).toHaveLength(5);
    expect(payload.questions[0]).toMatchObject({ ordinal: 1, source_url: 'https://example.com/source' });
    expect(payload.questions[0].options).toHaveLength(4);
    expect(payload.questions.every((question) => question.options.filter((option) => option.is_correct).length === 1)).toBe(true);
  });

  it('rejects invalid radius, XP, time and cooldown bounds', () => {
    const draft = createEmptyQuizDraft();
    draft.destinationId = 'spot-1';
    draft.title = 'Cape Bolinao Stories';
    draft.description = 'A quiz about the cape and its coastal heritage.';
    draft.radiusMeters = 50;
    draft.xpReward = 0;
    draft.timeLimitMinutes = 500;
    draft.cooldownHours = 500;

    const errors = validateQuizDraft(draft);
    expect(errors).toContain('Starting radius must be between 100 and 1000 meters.');
    expect(errors).toContain('XP reward must be a positive whole number.');
    expect(errors).toContain('Time limit must be between 5 and 120 minutes.');
    expect(errors).toContain('Cooldown must be between 1 and 168 hours.');
  });
});
