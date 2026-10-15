import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Plus, Save, Send, X } from 'lucide-react';
import { apiFetch } from '../api/client';
import { describeError } from '../utils/errors';
import {
  QUIZ_LANGUAGES,
  QuizDraftDefaults,
  QuizDraftForm,
  createEmptyQuizDraft,
  toQuizPayload,
  validateQuizBasics,
  validateQuizDraft,
  validateQuizQuestions,
} from '../utils/quizDraft';
import type { AdminQuizDetail, Spot } from '../types';

type EditorStep = 'basics' | 'questions' | 'preview';

interface QuizEditorProps {
  mode: 'create' | 'edit';
  quizId?: string;
  spots: Spot[];
  defaults?: QuizDraftDefaults;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function QuizEditor({ mode, quizId, spots, defaults, onClose, onSaved }: QuizEditorProps) {
  const [draft, setDraft] = useState<QuizDraftForm>(() => createEmptyQuizDraft(defaults));
  const [step, setStep] = useState<EditorStep>('basics');
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'edit' || !quizId) return;
    let active = true;
    const load = async () => {
      try {
        const detail = await apiFetch<AdminQuizDetail>(`/admin/quizzes/${quizId}`);
        if (!active) return;
        const questions = [...detail.questions].sort((a, b) => a.ordinal - b.ordinal);
        setDraft({
          destinationId: detail.quiz.destination_id,
          title: detail.version.title,
          description: detail.version.description,
          language: detail.version.language,
          radiusMeters: detail.version.radius_meters,
          xpReward: detail.version.xp_reward,
          timeLimitMinutes: detail.version.time_limit_minutes,
          cooldownHours: detail.version.cooldown_hours,
          isTest: detail.quiz.is_test,
          questions: questions.map((question) => ({
            questionText: question.question_text,
            explanation: question.explanation,
            sourceUrl: question.source_url || '',
            options: [...question.options]
              .sort((a, b) => a.ordinal - b.ordinal)
              .map((option) => ({ text: option.option_text, isCorrect: Boolean(option.is_correct) })),
          })),
        });
        setError('');
      } catch (cause) {
        if (active) setError(describeError(cause, 'The quiz draft could not be loaded.'));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [mode, quizId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [saving, onClose]);

  const updateQuestion = useCallback((questionIndex: number, update: (question: QuizDraftForm['questions'][number]) => void) => {
    setDraft((current) => {
      const questions = current.questions.map((question, index) => {
        if (index !== questionIndex) return question;
        const copy = { ...question, options: question.options.map((option) => ({ ...option })) };
        update(copy);
        return copy;
      });
      return { ...current, questions };
    });
  }, []);

  const goNext = () => {
    const errors = step === 'basics' ? validateQuizBasics(draft) : step === 'questions' ? validateQuizQuestions(draft) : [];
    if (errors.length) {
      setError(errors[0]);
      return;
    }
    setError('');
    setStep(step === 'basics' ? 'questions' : 'preview');
  };

  const save = async (publish: boolean) => {
    const errors = validateQuizDraft(draft);
    if (errors.length) {
      setError(errors[0]);
      setStep(errors.some((item) => item.startsWith('Question')) ? 'questions' : 'basics');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = toQuizPayload(draft);
      let savedId = quizId;
      if (mode === 'edit' && quizId) {
        await apiFetch(`/admin/quizzes/${quizId}`, { method: 'PATCH', body: payload });
      } else {
        const created = await apiFetch<{ quiz: { id: string } }>('/admin/quizzes', { method: 'POST', body: payload });
        savedId = created.quiz.id;
      }
      if (publish && savedId) {
        await apiFetch(`/admin/quizzes/${savedId}/publish`, { method: 'POST' });
        onSaved('Quiz published. Travelers inside the destination radius can start it now.');
      } else {
        onSaved('Draft saved. Publish it when the content is ready.');
      }
    } catch (cause) {
      setError(describeError(cause, 'Saving the quiz failed.'));
    } finally {
      setSaving(false);
    }
  };

  const publishedDestinations = spots
    .filter((spot) => spot.status === 'published')
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="modal-backdrop">
      <div
        className="stitch-panel quiz-editor-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-editor-title"
      >
        <div className="quiz-editor-header">
          <div>
            <h2 id="quiz-editor-title">{mode === 'edit' ? 'Edit quiz draft' : 'Create a cultural quiz'}</h2>
            <p className="quiz-editor-subtitle">
              Five location-bound questions with exactly one correct answer each. Published versions become immutable.
            </p>
          </div>
          <button type="button" className="quiz-editor-close" onClick={onClose} aria-label="Close quiz editor" disabled={saving}>
            <X size={18} />
          </button>
        </div>

        <ol className="quiz-steps" aria-label="Quiz editor steps">
          {(['basics', 'questions', 'preview'] as EditorStep[]).map((value, index) => (
            <li key={value} className={step === value ? 'is-active' : ''} aria-current={step === value ? 'step' : undefined}>
              <span>{index + 1}</span> {value === 'basics' ? 'Destination & basics' : value === 'questions' ? 'Questions' : 'Preview & save'}
            </li>
          ))}
        </ol>

        {loading ? <p className="page-state" role="status">Loading the draft…</p> : null}
        {error ? <div className="load-error" role="alert">{error}</div> : null}

        {!loading && step === 'basics' ? (
          <div className="quiz-form-grid">
            <label className="quiz-field quiz-field-wide">
              <span>Destination (published only)</span>
              <select
                value={draft.destinationId}
                onChange={(event) => setDraft({ ...draft, destinationId: event.target.value })}
              >
                <option value="">Choose a destination…</option>
                {publishedDestinations.map((spot) => (
                  <option key={spot.id} value={spot.id}>
                    {spot.name} · {spot.municipality}
                  </option>
                ))}
              </select>
            </label>
            <label className="quiz-field quiz-field-wide">
              <span>Title</span>
              <input
                type="text"
                autoFocus
                maxLength={200}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Stories of Cape Bolinao"
              />
            </label>
            <label className="quiz-field quiz-field-wide">
              <span>Description</span>
              <textarea
                rows={3}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                placeholder="What travelers will learn at this destination."
              />
            </label>
            <label className="quiz-field">
              <span>Language</span>
              <select
                value={draft.language}
                onChange={(event) => setDraft({ ...draft, language: event.target.value as QuizDraftForm['language'] })}
              >
                {QUIZ_LANGUAGES.map((language) => (
                  <option key={language.value} value={language.value}>{language.label}</option>
                ))}
              </select>
            </label>
            <label className="quiz-field">
              <span>Starting radius (m)</span>
              <input
                type="number"
                min={100}
                max={1000}
                value={draft.radiusMeters}
                onChange={(event) => setDraft({ ...draft, radiusMeters: Number(event.target.value) })}
              />
            </label>
            <label className="quiz-field">
              <span>XP reward (Explorer XP only)</span>
              <input
                type="number"
                min={1}
                value={draft.xpReward}
                onChange={(event) => setDraft({ ...draft, xpReward: Number(event.target.value) })}
              />
            </label>
            <label className="quiz-field">
              <span>Time limit (minutes)</span>
              <input
                type="number"
                min={5}
                max={120}
                value={draft.timeLimitMinutes}
                onChange={(event) => setDraft({ ...draft, timeLimitMinutes: Number(event.target.value) })}
              />
            </label>
            <label className="quiz-field">
              <span>Cooldown after failure (hours)</span>
              <input
                type="number"
                min={1}
                max={168}
                value={draft.cooldownHours}
                onChange={(event) => setDraft({ ...draft, cooldownHours: Number(event.target.value) })}
              />
            </label>
            <label className="quiz-checkbox quiz-field-wide">
              <input
                type="checkbox"
                checked={draft.isTest}
                onChange={(event) => setDraft({ ...draft, isTest: event.target.checked })}
              />
              Synthetic QA quiz (kept out of public discovery)
            </label>
          </div>
        ) : null}

        {!loading && step === 'questions' ? (
          <div className="quiz-question-list">
            {draft.questions.map((question, questionIndex) => (
              <fieldset key={questionIndex} className="quiz-question">
                <legend>
                  <Plus size={13} aria-hidden="true" /> Question {questionIndex + 1}
                </legend>
                <label className="quiz-field">
                  <span>Question text</span>
                  <input
                    type="text"
                    value={question.questionText}
                    onChange={(event) => updateQuestion(questionIndex, (target) => { target.questionText = event.target.value; })}
                  />
                </label>
                <div className="quiz-options">
                  {question.options.map((option, optionIndex) => (
                    <label key={optionIndex} className={`quiz-option${option.isCorrect ? ' is-correct' : ''}`}>
                      <input
                        type="radio"
                        name={`correct-${questionIndex}`}
                        checked={option.isCorrect}
                        onChange={() =>
                          updateQuestion(questionIndex, (target) => {
                            target.options.forEach((candidate, index) => { candidate.isCorrect = index === optionIndex; });
                          })
                        }
                        aria-label={`Mark option ${optionIndex + 1} as the correct answer`}
                      />
                      <input
                        type="text"
                        value={option.text}
                        placeholder={`Option ${optionIndex + 1}`}
                        onChange={(event) =>
                          updateQuestion(questionIndex, (target) => { target.options[optionIndex].text = event.target.value; })
                        }
                        aria-label={`Option ${optionIndex + 1} text`}
                      />
                    </label>
                  ))}
                </div>
                <p className="quiz-hint">Select the radio next to the single correct option.</p>
                <label className="quiz-field">
                  <span>Explanation (shown after submission)</span>
                  <textarea
                    rows={2}
                    value={question.explanation}
                    onChange={(event) => updateQuestion(questionIndex, (target) => { target.explanation = event.target.value; })}
                  />
                </label>
                <label className="quiz-field">
                  <span>Source URL (optional)</span>
                  <input
                    type="url"
                    value={question.sourceUrl}
                    placeholder="https://…"
                    onChange={(event) => updateQuestion(questionIndex, (target) => { target.sourceUrl = event.target.value; })}
                  />
                </label>
              </fieldset>
            ))}
          </div>
        ) : null}

        {!loading && step === 'preview' ? (
          <div className="quiz-preview">
            <h3 className="quiz-preview-title">{draft.title}</h3>
            <p className="quiz-preview-meta">
              {publishedDestinations.find((spot) => spot.id === draft.destinationId)?.name ?? 'Destination'} ·{' '}
              {QUIZ_LANGUAGES.find((language) => language.value === draft.language)?.label} · +{draft.xpReward} Explorer XP ·{' '}
              {draft.radiusMeters}m start radius · {draft.timeLimitMinutes} min
            </p>
            <p className="quiz-preview-description">{draft.description}</p>
            <ol className="quiz-preview-questions">
              {draft.questions.map((question, index) => (
                <li key={index}>
                  <p className="quiz-preview-question">{question.questionText}</p>
                  <ul>
                    {question.options.map((option, optionIndex) => (
                      <li key={optionIndex}>{option.text}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
            <p className="quiz-hint">
              <Eye size={13} aria-hidden="true" /> This is the traveler view. Correct answers and explanations are never returned by
              the API before submission; grading is server-side.
            </p>
            {draft.isTest ? <p className="quiz-hint">Synthetic QA quiz — it stays out of public discovery.</p> : null}
          </div>
        ) : null}

        <div className="quiz-editor-footer">
          <div className="quiz-editor-footer-left">
            {step !== 'basics' ? (
              <button type="button" className="button-muted" onClick={() => setStep(step === 'preview' ? 'questions' : 'basics')} disabled={saving}>
                <ChevronLeft size={15} aria-hidden="true" /> Back
              </button>
            ) : null}
          </div>
          <div className="quiz-editor-footer-right">
            {step !== 'preview' ? (
              <button type="button" className="button-approve" onClick={goNext} disabled={loading || saving}>
                Next <ChevronRight size={15} aria-hidden="true" />
              </button>
            ) : (
              <>
                <button type="button" className="button-muted" onClick={() => void save(false)} disabled={saving}>
                  <Save size={15} aria-hidden="true" /> {saving ? 'Saving…' : 'Save draft'}
                </button>
                <button type="button" className="button-approve" onClick={() => void save(true)} disabled={saving}>
                  <Send size={15} aria-hidden="true" /> Save & publish
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
