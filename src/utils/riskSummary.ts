export interface ResolvedEntities {
  spots: Record<string, string>;
  quests: Record<string, string>;
  campaigns: Record<string, string>;
  users: Record<string, string>;
}

export const RISK_RULE_LABELS: Record<string, string> = {
  stamp_spike: 'Stamp spike',
  points_spike: 'Points spike',
  impossible_travel: 'Impossible travel',
  gps_fail_burst: 'GPS/QR fail burst',
  proof_rejections: 'Proof rejections',
  report_target: 'Report target',
  vote_burst: 'Vote burst',
  admin_grant_large: 'Large admin grant',
};

export function describeRiskFlag(
  rule: string,
  evidence: Record<string, unknown> | null | undefined,
  entities?: ResolvedEntities,
): string {
  const ev = evidence ?? {};
  switch (rule) {
    case 'stamp_spike': {
      const earned = Number(ev.earned_24h ?? 0);
      const median = Number(ev.median_14d ?? 0);
      return median > 0
        ? `Earned ${earned} stamps in 24 h; usual is ${median}/day.`
        : `Earned ${earned} stamps in 24 h (no prior 14-day activity).`;
    }
    case 'points_spike': {
      const earned = Number(ev.earned_24h ?? 0);
      const median = Number(ev.median_14d ?? 0);
      return median > 0
        ? `Earned ${earned} mJDQ in 24 h; usual is ${median}/day.`
        : `Earned ${earned} mJDQ in 24 h (no prior 14-day baseline).`;
    }
    case 'impossible_travel': {
      const km = Number(ev.distance_km ?? 0);
      const mins = Number(ev.minutes_apart ?? 0);
      const kmh = Number(ev.speed_kmh ?? 0);
      const s1 =
        (typeof ev.first_spot_id === 'string' && entities?.spots[ev.first_spot_id]) ||
        (typeof ev.first_quest_id === 'string' && entities?.quests[ev.first_quest_id]) ||
        (typeof ev.first_spot_id === 'string' ? ev.first_spot_id : 'first site');
      const s2 =
        (typeof ev.second_spot_id === 'string' && entities?.spots[ev.second_spot_id]) ||
        (typeof ev.second_quest_id === 'string' && entities?.quests[ev.second_quest_id]) ||
        (typeof ev.second_spot_id === 'string' ? ev.second_spot_id : 'second site');
      return `Traveled ${km} km in ${mins} min (${kmh} km/h) between ${s1} and ${s2}.`;
    }
    case 'gps_fail_burst':
      return `${Number(ev.failed_tries_1h ?? 0)} failed location/QR tries in 1 h.`;
    case 'proof_rejections':
      return `${Number(ev.rejected_count_7d ?? 0)} rejected proof submissions in 7 days.`;
    case 'report_target':
      return `${Number(ev.distinct_reporters ?? 0)} distinct travelers reported this user (${Number(ev.spot_reports ?? 0)} spot, ${Number(ev.comment_reports ?? 0)} comment, ${Number(ev.avatar_reports ?? 0)} avatar) in 7 days.`;
    case 'vote_burst': {
      const count = Number(ev.cluster_accounts_count ?? 0);
      const age = Number(ev.account_age_hours ?? 0);
      const camp = typeof ev.campaign_id === 'string' ? entities?.campaigns[ev.campaign_id] ?? ev.campaign_id : 'campaign';
      return `Account (${age} h old) voted in a ${count}-account young burst on ${camp}.`;
    }
    case 'admin_grant_large': {
      const total = Number(ev.total_points_7d ?? 0);
      const admins = Array.isArray(ev.granting_admin_ids)
        ? ev.granting_admin_ids.map((id) => entities?.users[String(id)] ?? String(id)).join(', ')
        : 'admin';
      return `Received ${total} mJDQ in admin grants over 7 days (from ${admins || 'admin'}).`;
    }
    default:
      return rule;
  }
}

export function formatShortDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
