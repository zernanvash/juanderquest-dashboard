import { useCallback, useEffect, useState } from 'react';
import { Archive, BookOpen, PauseCircle, PlayCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageState';
import { QuizEditor } from '../components/QuizEditor';
import { describeError } from '../utils/errors';
import type { QuizDraftDefaults } from '../utils/quizDraft';
import type { AdminQuizListItem, CulturalQuizStatus, SettingsSnapshot, Spot } from '../types';

const STATUS_TONE: Record<CulturalQuizStatus, string> = {
  draft: 'status-pending',
  published: 'status-approved',
  paused: 'status-pending',
  archived: 'status-rejected',
};

const LIFECYCLE_EFFECTS = [
  { action: 'Publish', effect: 'Travelers inside the destination radius can start the quiz immediately. The current version becomes immutable.' },
  { action: 'Pause', effect: 'Blocks new attempts. Attempts already in progress can still be submitted until they expire.' },
  { action: 'Archive', effect: 'Removes the quiz from traveler surfaces. In-progress attempts are not abandoned and earned XP is kept.' },
  { action: 'Revoke', effect: 'Archives the quiz and abandons active attempts. Earned Explorer XP is never removed.' },
];

export function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<AdminQuizListItem[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; quizId?: string } | null>(null);
  const [defaults, setDefaults] = useState<QuizDraftDefaults | undefined>(undefined);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const [quizList, spotList, settings] = await Promise.all([
        apiFetch<AdminQuizListItem[]>('/admin/quizzes', { signal }),
        apiFetch<Spot[]>('/admin/spots', { signal }),
        apiFetch<SettingsSnapshot>('/admin/settings', { signal }).catch(() => null),
      ]);
      setQuizzes(quizList);
      setSpots(spotList);
      if (settings) {
        setDefaults({
          language: settings.values.quiz_default_language as QuizDraftDefaults['language'],
          radiusMeters: Number(settings.values.quiz_default_radius_meters),
          xpReward: Number(settings.values.quiz_default_xp_reward),
          timeLimitMinutes: Number(settings.values.quiz_default_time_limit_minutes),
          cooldownHours: Number(settings.values.quiz_default_cooldown_hours),
        });
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Unable to load cultural quizzes.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const runLifecycle = async (item: AdminQuizListItem, path: string, successMessage: string, body?: unknown) => {
    try {
      setBusyId(item.quiz.id);
      setError('');
      setNotice('');
      await apiFetch(`/admin/quizzes/${item.quiz.id}/${path}`, { method: 'POST', body });
      setNotice(successMessage);
      await load();
    } catch (cause) {
      setError(describeError(cause, `${path} failed.`));
    } finally {
      setBusyId(null);
    }
  };

  const publish = (item: AdminQuizListItem) => {
    if (!window.confirm(`Publish "${item.version.title}"? Travelers inside the destination radius can start it immediately, and this version becomes immutable.`)) return;
    void runLifecycle(item, 'publish', 'Quiz published.');
  };

  const pause = (item: AdminQuizListItem) => {
    if (!window.confirm(`Pause "${item.version.title}"? New attempts are blocked; attempts already in progress can still be submitted until they expire.`)) return;
    void runLifecycle(item, 'pause', 'Quiz paused.');
  };

  const archive = (item: AdminQuizListItem) => {
    if (!window.confirm(`Archive "${item.version.title}"? It disappears from traveler surfaces. Earned XP is kept and in-progress attempts are not abandoned.`)) return;
    void runLifecycle(item, 'archive', 'Quiz archived.');
  };

  const revoke = (item: AdminQuizListItem) => {
    const reason = window.prompt(`Reason for revoking "${item.version.title}" (at least 10 characters):`);
    if (reason === null) return;
    if (reason.trim().length < 10) {
      setError('Revocation reason must contain at least 10 characters.');
      return;
    }
    if (!window.confirm('Revoking archives the quiz and abandons active attempts. Earned XP is never removed. Continue?')) return;
    void runLifecycle(item, 'revoke', 'Quiz revoked; active attempts were abandoned.', { reason: reason.trim() });
  };

  return (
    <div>
      <PageHeader
        title="Cultural quizzes"
        description="Location-bound quizzes that grant Explorer XP only. Server grading stays private; published versions are immutable."
        actions={
          <button type="button" className="button-approve" onClick={() => setEditor({ mode: 'create' })}>
            <BookOpen size={15} aria-hidden="true" /> Create quiz
          </button>
        }
      />

      <div className="readonly-banner" role="note">
        <ShieldAlert size={15} aria-hidden="true" />
        Lifecycle effects: {LIFECYCLE_EFFECTS.map((entry) => `${entry.action} — ${entry.effect}`).join(' ')}
      </div>

      {error ? (
        <div className="load-error" role="alert">
          {error} <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      ) : null}
      {notice ? <p role="status" className="good-text quiz-notice">{notice}</p> : null}

      <div className="quiz-list-header">
        <span className="filter-label">{quizzes.length} {quizzes.length === 1 ? 'quiz' : 'quizzes'}</span>
        <button type="button" className="button-muted" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} aria-hidden="true" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="stitch-panel loading-panel">Loading cultural quizzes…</div>
      ) : quizzes.length === 0 ? (
        <div className="stitch-panel page-state page-state-empty">
          <BookOpen size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
          <p className="page-state-title">No cultural quiz exists yet.</p>
          <p className="page-state-detail">Create the first draft to enable a location-bound learning quiz.</p>
        </div>
      ) : (
        <div className="quiz-admin-grid">
          {quizzes.map((item) => {
            const { quiz, version } = item;
            const busy = busyId === quiz.id;
            return (
              <article key={quiz.id} className="stitch-card quiz-admin-card">
                <div className="destination-tags">
                  <span className={`status-pill ${STATUS_TONE[quiz.status]}`}>{quiz.status}</span>
                  {quiz.is_test ? (
                    <span className="qa-badge"><ShieldAlert size={12} aria-hidden="true" /> [QA]</span>
                  ) : null}
                  <span className="destination-tag">{version.language}</span>
                </div>
                <h3 className="destination-title">{version.title}</h3>
                <p className="destination-location">{item.destination_name}</p>
                <p className="destination-meta">
                  +{version.xp_reward} XP · {version.radius_meters}m start radius · {version.time_limit_minutes} min ·{' '}
                  {version.cooldown_hours}h cooldown · v{version.version}
                </p>
                <p className="destination-meta">
                  {version.published_at ? `Published ${new Date(version.published_at).toLocaleDateString()}` : 'Unpublished draft'}
                </p>
                <div className="quiz-admin-actions">
                  {quiz.status === 'draft' ? (
                    <>
                      <button type="button" className="button-muted" disabled={busy} onClick={() => setEditor({ mode: 'edit', quizId: quiz.id })}>
                        Edit draft
                      </button>
                      <button type="button" className="button-approve" disabled={busy} onClick={() => publish(item)}>
                        <PlayCircle size={14} aria-hidden="true" /> Publish
                      </button>
                    </>
                  ) : null}
                  {quiz.status === 'published' ? (
                    <button type="button" className="button-muted" disabled={busy} onClick={() => pause(item)}>
                      <PauseCircle size={14} aria-hidden="true" /> Pause
                    </button>
                  ) : null}
                  {quiz.status === 'paused' ? (
                    <button type="button" className="button-approve" disabled={busy} onClick={() => publish(item)}>
                      <PlayCircle size={14} aria-hidden="true" /> Resume
                    </button>
                  ) : null}
                  {quiz.status !== 'archived' ? (
                    <>
                      <button type="button" className="button-muted" disabled={busy} onClick={() => archive(item)}>
                        <Archive size={14} aria-hidden="true" /> Archive
                      </button>
                      <button type="button" className="button-danger" disabled={busy} onClick={() => revoke(item)}>
                        Revoke
                      </button>
                    </>
                  ) : (
                    <p className="destination-meta">Archived — retained for history only.</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editor ? (
        <QuizEditor
          mode={editor.mode}
          quizId={editor.quizId}
          spots={spots}
          defaults={defaults}
          onClose={() => setEditor(null)}
          onSaved={(message) => {
            setEditor(null);
            setNotice(message);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
