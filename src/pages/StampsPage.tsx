import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';

interface StampStats {
  date: string;
  week_id: string;
  claims_today: number;
  missions_completed_today: number;
  weekly_cap_hits: number;
  travelers_today: number;
  outstanding_balance: number;
}
interface DailyMission {
  id: string;
  kind: string;
  title: string;
  stamps: number;
  on_site: boolean;
  active: boolean;
}
interface QotdOption {
  option_text: string;
  is_correct: boolean;
}
interface QotdQuestion {
  id: string;
  question_text: string;
  explanation: string;
  source_url: string | null;
  active: boolean;
  options: QotdOption[];
}

const blankOptions = (): QotdOption[] => [0, 1, 2, 3].map((i) => ({ option_text: '', is_correct: i === 0 }));

/** Plan 92b: daily missions, the Question of the Day bank and its calendar (platform staff only). */
export function StampsPage() {
  const [stats, setStats] = useState<StampStats | null>(null);
  const [missions, setMissions] = useState<DailyMission[]>([]);
  const [questions, setQuestions] = useState<QotdQuestion[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [mission, setMission] = useState({ kind: '', title: '', stamps: 5, on_site: false });
  const [draft, setDraft] = useState({ question_text: '', explanation: '', options: blankOptions() });
  const [editing, setEditing] = useState<{ id: string; question_text: string; explanation: string } | null>(null);
  const [schedule, setSchedule] = useState({ manila_date: '', question_id: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [statData, missionData, questionData] = await Promise.all([
        apiFetch<StampStats>('/admin/stamps/stats'),
        apiFetch<DailyMission[]>('/admin/stamps/missions'),
        apiFetch<QotdQuestion[]>('/admin/stamps/qotd/questions'),
      ]);
      setStats(statData);
      setMissions(missionData);
      setQuestions(questionData);
    } catch (cause) {
      setError(describeError(cause, 'Unable to load stamps.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(done);
      await load();
    } catch (cause) {
      setError(describeError(cause, 'That change did not go through.'));
    }
  };

  const createMission = (event: FormEvent) => {
    event.preventDefault();
    void run(
      () => apiFetch('/admin/stamps/missions', { method: 'POST', body: { ...mission, active: true } }),
      'Mission saved.',
    ).then(() => setMission({ kind: '', title: '', stamps: 5, on_site: false }));
  };

  const createQuestion = (event: FormEvent) => {
    event.preventDefault();
    void run(
      () => apiFetch('/admin/stamps/qotd/questions', { method: 'POST', body: draft }),
      'Question added to the bank.',
    ).then(() => setDraft({ question_text: '', explanation: '', options: blankOptions() }));
  };

  const scheduleQuestion = (event: FormEvent) => {
    event.preventDefault();
    void run(() => apiFetch('/admin/stamps/qotd', { method: 'PUT', body: schedule }), 'Question of the Day scheduled.');
  };

  return (
    <div className="stamps-page">
      <PageHeader
        title="Stamps & Question of the Day"
        description="Daily missions travelers earn stamps from, the Question of the Day bank, and which question runs on which Manila date."
      />
      {error ? (
        <div className="load-error" role="alert">
          {error} <button type="button" className="button button-secondary" onClick={() => void load()}>Retry</button>
        </div>
      ) : null}
      {notice ? (
        <div className="readonly-banner" role="status">
          {notice}
        </div>
      ) : null}
      {loading && !stats ? <div className="stitch-panel loading-panel">Loading stamps…</div> : null}

      {stats ? (
        <section className="stitch-panel stamps-panel" aria-label="Today">
          <h2 className="section-title">Today{stats.date ? ` (${stats.date})` : ''}</h2>
          <div className="stamps-stats-row">
            <span className="stamps-stat-pill">Claims: {stats.claims_today}</span>
            <span className="stamps-stat-pill">Missions done: {stats.missions_completed_today}</span>
            <span className="stamps-stat-pill">Travelers: {stats.travelers_today}</span>
            <span className="stamps-stat-pill">Weekly cap hits: {stats.weekly_cap_hits}</span>
            <span className="stamps-stat-pill">Stamps held: {stats.outstanding_balance}</span>
          </div>
        </section>
      ) : null}

      <section className="stitch-panel stamps-panel" aria-label="Daily missions">
        <h2 className="section-title">Daily missions</h2>
        {missions.length ? (
          <ul className="stamps-list">
            {missions.map((item) => (
              <li key={item.id} className="stamps-list-item">
                <span>
                  {item.title} · {item.stamps} stamps{item.on_site ? ' · on site' : ''} · {item.active ? 'active' : 'off'}
                </span>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() =>
                    void run(
                      () =>
                        apiFetch(`/admin/stamps/missions/${item.id}`, { method: 'PATCH', body: { active: !item.active } }),
                      item.active ? 'Mission turned off.' : 'Mission turned on.',
                    )
                  }
                >
                  {item.active ? 'Turn off' : 'Turn on'}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <form className="form-grid" onSubmit={createMission} aria-label="New mission">
          <label>
            Kind
            <input value={mission.kind} onChange={(e) => setMission({ ...mission, kind: e.target.value })} />
          </label>
          <label>
            Title
            <input value={mission.title} onChange={(e) => setMission({ ...mission, title: e.target.value })} />
          </label>
          <label>
            Stamps
            <input
              type="number"
              min={1}
              max={100}
              value={mission.stamps}
              onChange={(e) => setMission({ ...mission, stamps: Number(e.target.value) })}
            />
          </label>
          <label className="form-check">
            <input
              type="checkbox"
              checked={mission.on_site}
              onChange={(e) => setMission({ ...mission, on_site: e.target.checked })}
            />
            On site
          </label>
          <div className="form-actions">
            <button type="submit" className="button button-approve">Add mission</button>
          </div>
        </form>
      </section>

      <section className="stitch-panel stamps-panel" aria-label="Question bank">
        <h2 className="section-title">Question of the Day bank</h2>
        {questions.length ? (
          <ul className="stamps-list">
            {questions.map((question) => (
              <li key={question.id} className="stamps-list-item">
                {editing?.id === question.id ? (
                  <form
                    className="form-inline"
                    style={{ width: '100%' }}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(
                        () =>
                          apiFetch(`/admin/stamps/qotd/questions/${question.id}`, {
                            method: 'PATCH',
                            body: { question_text: editing.question_text, explanation: editing.explanation },
                          }),
                        'Question updated.',
                      ).then(() => setEditing(null));
                    }}
                  >
                    <input
                      aria-label="Edit question"
                      value={editing.question_text}
                      onChange={(e) => setEditing({ ...editing, question_text: e.target.value })}
                    />
                    <input
                      aria-label="Edit explanation"
                      value={editing.explanation}
                      onChange={(e) => setEditing({ ...editing, explanation: e.target.value })}
                    />
                    <button type="submit" className="button button-approve">Save</button>
                    <button type="button" className="button button-secondary" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <>
                    <span>
                      {question.question_text} · {question.active ? 'in rotation' : 'candidate'}
                    </span>
                    <div className="form-actions">
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() =>
                          setEditing({
                            id: question.id,
                            question_text: question.question_text,
                            explanation: question.explanation,
                          })
                        }
                      >
                        Edit
                      </button>
                      {!question.active ? (
                        <button
                          type="button"
                          className="button button-approve"
                          onClick={() =>
                            void run(
                              () =>
                                apiFetch(`/admin/stamps/qotd/questions/${question.id}`, {
                                  method: 'PATCH',
                                  body: { active: true },
                                }),
                              'Question promoted to the rotation.',
                            )
                          }
                        >
                          Promote
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <form className="form-grid" onSubmit={createQuestion} aria-label="New question">
          <label>
            Question
            <input
              value={draft.question_text}
              onChange={(e) => setDraft({ ...draft, question_text: e.target.value })}
            />
          </label>
          <label>
            Explanation
            <input value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} />
          </label>
          {draft.options.map((option, index) => (
            <label key={index} className="stamps-option-field">
              <span>Option {index + 1}</span>
              <span className="stamps-option-row">
                <input
                  value={option.option_text}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      options: draft.options.map((o, i) => (i === index ? { ...o, option_text: e.target.value } : o)),
                    })
                  }
                />
                <input
                  type="radio"
                  name="qotd-correct"
                  aria-label={`Option ${index + 1} is correct`}
                  checked={option.is_correct}
                  onChange={() =>
                    setDraft({ ...draft, options: draft.options.map((o, i) => ({ ...o, is_correct: i === index })) })
                  }
                />
              </span>
            </label>
          ))}
          <div className="form-actions">
            <button type="submit" className="button button-approve">Add question</button>
          </div>
        </form>
      </section>

      <section className="stitch-panel stamps-panel" aria-label="Schedule">
        <h2 className="section-title">Schedule a date</h2>
        <form className="form-grid" onSubmit={scheduleQuestion}>
          <label>
            Manila date
            <input
              type="date"
              value={schedule.manila_date}
              onChange={(e) => setSchedule({ ...schedule, manila_date: e.target.value })}
            />
          </label>
          <label>
            Question
            <select
              value={schedule.question_id}
              onChange={(e) => setSchedule({ ...schedule, question_id: e.target.value })}
            >
              <option value="">Choose a question</option>
              {questions.map((question) => (
                <option key={question.id} value={question.id}>
                  {question.question_text}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <button type="submit" className="button button-approve" disabled={!schedule.manila_date || !schedule.question_id}>
              Schedule
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
