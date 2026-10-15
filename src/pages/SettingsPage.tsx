import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, RefreshCw, Save, Settings2, ShieldCheck } from 'lucide-react';
import { ApiError, apiFetch } from '../api/client';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';
import type { SettingDefinition, SettingValue, SettingsAuditEntry, SettingsSnapshot } from '../types';

const CATEGORY_LABELS: Record<SettingDefinition['category'], string> = {
  branding_support: 'Branding and support',
  quiz_defaults: 'Quiz defaults (new drafts only)',
};

interface ConflictState {
  revision: number;
  serverValues: Record<string, SettingValue>;
}

export function SettingsPage() {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null);
  const [draft, setDraft] = useState<Record<string, SettingValue>>({});
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [audit, setAudit] = useState<SettingsAuditEntry[]>([]);

  const loadAudit = useCallback(async () => {
    try {
      const data = await apiFetch<{ scope: string; entries: SettingsAuditEntry[] }>('/admin/settings/audit?limit=10');
      setAudit(data.entries);
    } catch {
      setAudit([]);
    }
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const data = await apiFetch<SettingsSnapshot>('/admin/settings', { signal });
      setSnapshot(data);
      setDraft(data.values);
      setConflict(null);
      await loadAudit();
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Settings could not be loaded.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [loadAudit]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const changedKeys = useMemo(() => {
    if (!snapshot) return [];
    return Object.keys(snapshot.values).filter((key) => draft[key] !== snapshot.values[key]);
  }, [snapshot, draft]);

  const groupedDefinitions = useMemo(() => {
    if (!snapshot) return [];
    const groups = new Map<SettingDefinition['category'], SettingDefinition[]>();
    for (const definition of snapshot.definitions) {
      const list = groups.get(definition.category) ?? [];
      list.push(definition);
      groups.set(definition.category, list);
    }
    return Array.from(groups.entries());
  }, [snapshot]);

  const updateValue = (definition: SettingDefinition, raw: string | boolean) => {
    let value: SettingValue = raw as SettingValue;
    if (definition.type === 'integer') value = raw === '' ? Number.NaN : Number(raw);
    setDraft((current) => ({ ...current, [definition.key]: value }));
  };

  const save = async () => {
    if (!snapshot || changedKeys.length === 0) return;
    setSaving(true);
    setError('');
    setNotice('');
    setConflict(null);
    try {
      const changes = Object.fromEntries(changedKeys.map((key) => [key, draft[key]]));
      const result = await apiFetch<{ revision: number; values: Record<string, SettingValue>; changed_keys: string[] }>('/admin/settings', {
        method: 'PUT',
        body: {
          expected_revision: snapshot.revision,
          changes,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
      });
      setSnapshot({ ...snapshot, revision: result.revision, values: result.values });
      setDraft(result.values);
      setReason('');
      setNotice(`Settings saved. Now at revision ${result.revision}.`);
      await loadAudit();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        const current = (cause.payload as { current?: { revision: number; values: Record<string, SettingValue> } } | undefined)?.current;
        setError(cause.message);
        if (current) {
          setConflict({ revision: current.revision, serverValues: current.values });
          setSnapshot((existing) => (existing ? { ...existing, revision: current.revision, values: current.values } : existing));
        }
      } else {
        setError(describeError(cause, 'Saving settings failed.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const renderField = (definition: SettingDefinition) => {
    const value = draft[definition.key];
    if (definition.type === 'boolean') {
      return (
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => updateValue(definition, event.target.checked)}
          />
          <span>{definition.label}</span>
        </label>
      );
    }
    if (definition.type === 'text') {
      return (
        <label className="quiz-field">
          <span>{definition.label}</span>
          <textarea
            rows={2}
            maxLength={definition.maxLength}
            value={String(value ?? '')}
            onChange={(event) => updateValue(definition, event.target.value)}
            aria-label={definition.label}
          />
        </label>
      );
    }
    if (definition.type === 'string' && definition.allowedValues) {
      return (
        <label className="quiz-field">
          <span>{definition.label}</span>
          <select value={String(value ?? '')} onChange={(event) => updateValue(definition, event.target.value)}>
            {definition.allowedValues.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      );
    }
    return (
      <label className="quiz-field">
        <span>{definition.label}</span>
        <input
          type={definition.type === 'integer' ? 'number' : definition.type === 'email' ? 'email' : definition.type === 'url' ? 'url' : 'text'}
          min={definition.min}
          max={definition.max}
          maxLength={definition.maxLength}
          value={String(value ?? '')}
          onChange={(event) => updateValue(definition, event.target.value)}
          aria-label={definition.label}
        />
      </label>
    );
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Approved low-risk settings only. Every save is validated on the server, revision-checked and audited. Secrets and deployment configuration are never editable here."
        actions={
          <button type="button" className="button-muted" onClick={() => void load()} disabled={loading || saving}>
            <RefreshCw size={14} aria-hidden="true" /> Reload
          </button>
        }
      />

      {error ? (
        <div className="load-error" role="alert">
          {error} <button type="button" onClick={() => void load()}>Reload latest</button>
        </div>
      ) : null}

      {conflict ? (
        <div className="conflict-banner" role="alert">
          <strong>Conflict at revision {conflict.revision}.</strong> Another editor saved settings while this form was open. Your unsaved
          values are kept; review these server values before saving again:{' '}
          {changedKeys.length === 0
            ? 'no local changes remain.'
            : changedKeys
                .map((key) => `${key} — server: ${JSON.stringify(conflict.serverValues[key])}, yours: ${JSON.stringify(draft[key])}`)
                .join(' · ')}
        </div>
      ) : null}

      {notice ? <p role="status" className="good-text quiz-notice">{notice}</p> : null}

      {loading && !snapshot ? (
        <div className="stitch-panel loading-panel">Loading settings…</div>
      ) : snapshot ? (
        <>
          <div className="settings-meta">
            <Settings2 size={14} aria-hidden="true" /> Revision {snapshot.revision}
            {snapshot.updated_at ? ` · last saved ${new Date(snapshot.updated_at).toLocaleString()}` : ' · defaults not yet saved'}
          </div>

          {groupedDefinitions.map(([category, definitions]) => (
            <section key={category} className="stitch-panel settings-section" aria-label={CATEGORY_LABELS[category]}>
              <h2 className="settings-section-title">{CATEGORY_LABELS[category]}</h2>
              <div className="settings-grid">
                {definitions.map((definition) => (
                  <div key={definition.key} className="settings-field">
                    {renderField(definition)}
                    <p className="settings-description">{definition.description}</p>
                    {definition.restartRequired ? <p className="settings-restart">Requires a service restart to take effect.</p> : null}
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div className="settings-save-bar">
            <label className="settings-reason">
              <span>Reason for this change (optional, recorded in the audit feed)</span>
              <input
                type="text"
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <span className="settings-dirty" role="status">
              {changedKeys.length === 0 ? 'No unsaved changes.' : `${changedKeys.length} unsaved change${changedKeys.length === 1 ? '' : 's'}.`}
            </span>
            <button
              type="button"
              className="button-approve"
              disabled={saving || changedKeys.length === 0}
              onClick={() => void save()}
            >
              <Save size={15} aria-hidden="true" /> {saving ? 'Saving…' : 'Save settings'}
            </button>
          </div>

          <section className="stitch-panel settings-audit" aria-label="Settings audit">
            <h2 className="settings-section-title">
              <History size={15} aria-hidden="true" /> Settings audit
            </h2>
            <p className="settings-description">
              <ShieldCheck size={13} aria-hidden="true" /> This feed covers settings changes only — it is not a universal administration
              history. Domain actions keep their own audit trails.
            </p>
            {audit.length === 0 ? (
              <p className="settings-description">No settings change has been recorded yet.</p>
            ) : (
              <ul className="settings-audit-list">
                {audit.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>Revision {entry.revision}</strong>
                      <span>{new Date(entry.created_at).toLocaleString()}</span>
                    </div>
                    <p>
                      {entry.changed_keys.join(', ')}
                      {entry.reason ? ` — ${entry.reason}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
