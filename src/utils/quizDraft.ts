import type { CulturalQuizLanguage, CulturalQuizQuestionType } from '../types';

export interface QuizDraftOption {
  text: string;
  isCorrect: boolean;
}

export interface QuizDraftQuestion {
  questionType?: CulturalQuizQuestionType;
  mediaUrl?: string;
  questionText: string;
  explanation: string;
  sourceUrl: string;
  options: QuizDraftOption[];
}

export const QUIZ_QUESTION_TYPES: { value: CulturalQuizQuestionType; label: string }[] = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'true_false', label: 'Myth vs Fact' },
  { value: 'photo_clue', label: 'Photo clue' },
  { value: 'sequence_order', label: 'Sequence order' },
];

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
  questionType: 'multiple_choice',
  mediaUrl: '',
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

export const applyQuestionType = (
  question: QuizDraftQuestion,
  nextType: CulturalQuizQuestionType,
): QuizDraftQuestion => {
  if (nextType === question.questionType) return question;
  if (nextType === 'true_false') {
    return {
      ...question,
      questionType: 'true_false',
      mediaUrl: '',
      options: [
        { text: 'Fact', isCorrect: true },
        { text: 'Myth', isCorrect: false },
      ],
    };
  }
  if (nextType === 'sequence_order') {
    const existing = question.options.slice(0, 4).map((o) => ({ text: o.text, isCorrect: false }));
    while (existing.length < 3) existing.push({ text: '', isCorrect: false });
    return {
      ...question,
      questionType: 'sequence_order',
      mediaUrl: '',
      options: existing,
    };
  }
  const existing = question.options.slice(0, 4).map((o) => ({ ...o }));
  while (existing.length < 4) existing.push({ text: '', isCorrect: false });
  if (existing.filter((o) => o.isCorrect).length !== 1) {
    existing.forEach((o, i) => { o.isCorrect = i === 0; });
  }
  return {
    ...question,
    questionType: nextType,
    mediaUrl: nextType === 'photo_clue' ? question.mediaUrl : '',
    options: existing,
  };
};

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
    const qType: CulturalQuizQuestionType = question.questionType ?? 'multiple_choice';
    if (qType === 'true_false') {
      if (question.options.length !== 2) errors.push(`${label}: Myth vs Fact requires exactly 2 options.`);
      question.options.forEach((option, optionIndex) => {
        if (!option.text.trim()) errors.push(`${label}: option ${optionIndex + 1} text is required.`);
      });
      const correct = question.options.filter((option) => option.isCorrect).length;
      if (correct !== 1) errors.push(`${label}: mark exactly one correct answer (currently ${correct}).`);
    } else if (qType === 'sequence_order') {
      if (question.options.length < 3 || question.options.length > 4) {
        errors.push(`${label}: sequence order requires 3 or 4 steps.`);
      }
      question.options.forEach((option, optionIndex) => {
        if (!option.text.trim()) errors.push(`${label}: step ${optionIndex + 1} text is required.`);
      });
    } else {
      if (qType === 'photo_clue' && !(question.mediaUrl ?? '').trim()) {
        errors.push(`${label}: choose a destination photo for the photo clue.`);
      }
      if (question.options.length !== 4) errors.push(`${label}: exactly 4 options are required.`);
      question.options.forEach((option, optionIndex) => {
        if (!option.text.trim()) errors.push(`${label}: option ${optionIndex + 1} text is required.`);
      });
      const correct = question.options.filter((option) => option.isCorrect).length;
      if (correct !== 1) errors.push(`${label}: mark exactly one correct answer (currently ${correct}).`);
    }
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
  questions: draft.questions.map((question, index) => {
    const qType: CulturalQuizQuestionType = question.questionType ?? 'multiple_choice';
    return {
      ordinal: index + 1,
      question_type: qType,
      ...(qType === 'photo_clue' && (question.mediaUrl ?? '').trim() ? { media_url: question.mediaUrl!.trim() } : {}),
      question_text: question.questionText.trim(),
      explanation: question.explanation.trim(),
      ...(question.sourceUrl.trim() ? { source_url: question.sourceUrl.trim() } : {}),
      options: question.options.map((option, optionIndex) => ({
        ordinal: optionIndex + 1,
        option_text: option.text.trim(),
        is_correct: qType === 'sequence_order' ? false : option.isCorrect,
      })),
    };
  }),
});
