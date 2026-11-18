import { describe, expect, it } from 'vitest';
import { applyQuestionType, createEmptyQuizDraft, createQuestion, toQuizPayload, validateQuizDraft } from './quizDraft';

describe('quiz draft validation', () => {
  it('starts a new draft with 1 blank question and reports missing basics', () => {
    const empty = createEmptyQuizDraft();
    expect(empty.questions).toHaveLength(1);
    const errors = validateQuizDraft(empty);
    expect(errors).toContain('Pin a location on the map or choose a published destination.');
    expect(errors).toContain('Title must be at least 3 characters.');
    expect(errors).toContain('Description must be at least 10 characters.');
  });

  it('requires exactly one correct answer per question and names the incomplete question', () => {
    const draft = createEmptyQuizDraft();
    draft.destinationId = 'spot-1';
    draft.title = 'Cape Bolinao Stories';
    draft.description = 'A quiz about the cape and its coastal heritage.';
    draft.questions = [createQuestion(), createQuestion()].map((_question, index) => ({
      questionText: index === 0 ? 'Question 1?' : '',
      explanation: 'Because the source confirms it.',
      sourceUrl: '',
      options: [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: index === 0 },
        { text: 'C', isCorrect: false },
        { text: 'D', isCorrect: false },
      ],
    }));

    const errors = validateQuizDraft(draft);
    expect(errors).toContain('Question 1: mark exactly one correct answer (currently 2).');
    expect(errors).toContain('Question 2: question text must be at least 3 characters.');
  });

  it('accepts a minimal 1-question draft and maps it to the API payload', () => {
    const draft = createEmptyQuizDraft();
    draft.destinationId = 'spot-1';
    draft.title = 'Cape Bolinao Stories';
    draft.description = 'A quiz about the cape and its coastal heritage.';
    draft.language = 'fil';
    draft.radiusMeters = 300;
    draft.xpReward = 40;
    draft.timeLimitMinutes = 20;
    draft.cooldownHours = 48;
    draft.questions = [
      {
        questionText: 'Question 1?',
        explanation: 'Because the source confirms it.',
        sourceUrl: 'https://example.com/source',
        options: [
          { text: 'A', isCorrect: false },
          { text: 'B', isCorrect: true },
          { text: 'C', isCorrect: false },
          { text: 'D', isCorrect: false },
        ],
      },
    ];

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
    expect(payload.questions).toHaveLength(1);
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

  it('validates and maps true_false, photo_clue, and sequence_order question types', () => {
    const draft = createEmptyQuizDraft();
    draft.destinationId = 'spot-1';
    draft.title = 'Cape Bolinao Stories';
    draft.description = 'A quiz about the cape and its coastal heritage.';
    draft.questions = Array.from({ length: 5 }, () => createQuestion());

    draft.questions[0] = {
      questionType: 'multiple_choice',
      questionText: 'Question 1?',
      explanation: 'Expl 1',
      sourceUrl: '',
      options: [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: false },
        { text: 'C', isCorrect: false },
        { text: 'D', isCorrect: false },
      ],
    };
    draft.questions[1] = {
      ...applyQuestionType(draft.questions[1], 'true_false'),
      questionText: 'Is Bolinao in Pangasinan?',
      explanation: 'Yes it is.',
    };
    draft.questions[2] = {
      ...applyQuestionType(draft.questions[2], 'photo_clue'),
      questionText: 'What landmark is shown?',
      explanation: 'Cape Bolinao Lighthouse.',
      mediaUrl: '',
      options: [
        { text: 'Lighthouse', isCorrect: true },
        { text: 'Church', isCorrect: false },
        { text: 'Bridge', isCorrect: false },
        { text: 'Plaza', isCorrect: false },
      ],
    };
    draft.questions[3] = {
      ...applyQuestionType(draft.questions[3], 'sequence_order'),
      questionText: 'Order the route stops.',
      explanation: 'Lingayen -> Alaminos -> Bolinao',
      options: [
        { text: 'Lingayen', isCorrect: false },
        { text: 'Alaminos', isCorrect: false },
        { text: 'Bolinao', isCorrect: false },
      ],
    };
    draft.questions[4] = {
      questionType: 'multiple_choice',
      questionText: 'Question 5?',
      explanation: 'Expl 5',
      sourceUrl: '',
      options: [
        { text: '1', isCorrect: true },
        { text: '2', isCorrect: false },
        { text: '3', isCorrect: false },
        { text: '4', isCorrect: false },
      ],
    };

    const missingPhotoErrors = validateQuizDraft(draft);
    expect(missingPhotoErrors).toContain('Question 3: choose a destination photo for the photo clue.');

    draft.questions[2].mediaUrl = 'https://juanderquest.app/media/cape.jpg';
    expect(validateQuizDraft(draft)).toEqual([]);

    const payload = toQuizPayload(draft);
    expect(payload.questions[1].question_type).toBe('true_false');
    expect(payload.questions[1].options).toHaveLength(2);
    expect(payload.questions[2].question_type).toBe('photo_clue');
    expect(payload.questions[2].media_url).toBe('https://juanderquest.app/media/cape.jpg');
    expect(payload.questions[3].question_type).toBe('sequence_order');
    expect(payload.questions[3].options).toHaveLength(3);
    expect(payload.questions[3].options.every((o) => o.is_correct === false)).toBe(true);
  });
});
