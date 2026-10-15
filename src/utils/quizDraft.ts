import type { CulturalQuizLanguage } from '../types';

export interface QuizDraftOption {
  text: string;
  isCorrect: boolean;
}

export interface QuizDraftQuestion {
  questionText: string;
  explanation: string;
  sourceUrl: string;
  options: QuizDraftOption[];
}

export interface QuizDraftForm {
  destinationId: string;
  title: string;
  description: string;
  language: CulturalQuizLanguage;
  radiusMeters: number;
  xpReward: number;
  timeLimitMinutes: number;
  cooldownHours: number;
  isTest: boolean;
  questions: QuizDraftQuestion[];
}

export const QUIZ_LANGUAGES: { value: CulturalQuizLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fil', label: 'Filipino' },
  { value: 'ilo', label: 'Ilocano' },
  { value: 'pag', label: 'Pangasinan' },
];

const createQuestion = (): QuizDraftQuestion => ({
  questionText: '',
  explanation: '',
  sourceUrl: '',
  options: [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ],
});

export interface QuizDraftDefaults {
  language?: CulturalQuizLanguage;
  radiusMeters?: number;
  xpReward?: number;
  timeLimitMinutes?: number;
  cooldownHours?: number;
}

export const createEmptyQuizDraft = (defaults: QuizDraftDefaults = {}): QuizDraftForm => ({
  destinationId: '',
  title: '',
  description: '',
  language: defaults.language ?? 'en',
  radiusMeters: defaults.radiusMeters ?? 200,
  xpReward: defaults.xpReward ?? 25,
  timeLimitMinutes: defaults.timeLimitMinutes ?? 30,
  cooldownHours: defaults.cooldownHours ?? 24,
  isTest: false,
  questions: Array.from({ length: 5 }, createQuestion),
});

export const validateQuizBasics = (draft: QuizDraftForm): string[] => {
  const errors: string[] = [];
  if (!draft.destinationId) errors.push('Choose a published destination.');
  if (draft.title.trim().length < 3) errors.push('Title must be at least 3 characters.');
  if (draft.title.trim().length > 200) errors.push('Title must be at most 200 characters.');
  if (draft.description.trim().length < 10) errors.push('Description must be at least 10 characters.');
  if (!Number.isInteger(draft.radiusMeters) || draft.radiusMeters < 100 || draft.radiusMeters > 1000) {
    errors.push('Starting radius must be between 100 and 1000 meters.');
  }
  if (!Number.isInteger(draft.xpReward) || draft.xpReward <= 0) errors.push('XP reward must be a positive whole number.');
  if (!Number.isInteger(draft.timeLimitMinutes) || draft.timeLimitMinutes < 5 || draft.timeLimitMinutes > 120) {
    errors.push('Time limit must be between 5 and 120 minutes.');
  }
  if (!Number.isInteger(draft.cooldownHours) || draft.cooldownHours < 1 || draft.cooldownHours > 168) {
    errors.push('Cooldown must be between 1 and 168 hours.');
  }
  return errors;
};

export const validateQuizQuestions = (draft: QuizDraftForm): string[] => {
  const errors: string[] = [];
  if (draft.questions.length !== 5) errors.push('Exactly 5 questions are required.');
  draft.questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (question.questionText.trim().length < 3) errors.push(`${label}: question text must be at least 3 characters.`);
    if (question.explanation.trim().length < 3) errors.push(`${label}: an explanation is required (at least 3 characters).`);
    if (question.sourceUrl.trim()) {
      try {
        new URL(question.sourceUrl.trim());
      } catch {
        errors.push(`${label}: source URL must be a valid URL or left empty.`);
      }
    }
    if (question.options.length !== 4) errors.push(`${label}: exactly 4 options are required.`);
    question.options.forEach((option, optionIndex) => {
      if (!option.text.trim()) errors.push(`${label}: option ${optionIndex + 1} text is required.`);
    });
    const correct = question.options.filter((option) => option.isCorrect).length;
    if (correct !== 1) errors.push(`${label}: mark exactly one correct answer (currently ${correct}).`);
  });
  return errors;
};

export const validateQuizDraft = (draft: QuizDraftForm): string[] => [
  ...validateQuizBasics(draft),
  ...validateQuizQuestions(draft),
];

export const toQuizPayload = (draft: QuizDraftForm) => ({
  destination_id: draft.destinationId,
  title: draft.title.trim(),
  description: draft.description.trim(),
  language: draft.language,
  radius_meters: draft.radiusMeters,
  xp_reward: draft.xpReward,
  time_limit_minutes: draft.timeLimitMinutes,
  cooldown_hours: draft.cooldownHours,
  is_test: draft.isTest,
  questions: draft.questions.map((question, index) => ({
    ordinal: index + 1,
    question_text: question.questionText.trim(),
    explanation: question.explanation.trim(),
    ...(question.sourceUrl.trim() ? { source_url: question.sourceUrl.trim() } : {}),
    options: question.options.map((option, optionIndex) => ({
      ordinal: optionIndex + 1,
      option_text: option.text.trim(),
      is_correct: option.isCorrect,
    })),
  })),
});
