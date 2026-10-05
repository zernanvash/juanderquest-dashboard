import React from 'react';
import { CheckCircle2, Clock, XCircle, ShieldCheck, Target, TrendingUp } from 'lucide-react';

interface SubmissionSummaryItem {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  distance_meters: number;
  quest_radius_meters: number;
}

export function QueueVisualAnalytics({
  submissions,
}: {
  submissions: SubmissionSummaryItem[];
}) {
  if (submissions.length === 0) return null;

  const total = submissions.length;
  const approved = submissions.filter((s) => s.status === 'approved').length;
  const pending = submissions.filter((s) => s.status === 'pending').length;
  const rejected = submissions.filter((s) => s.status === 'rejected').length;

  const approvedPct = Math.round((approved / total) * 100);
  const pendingPct = Math.round((pending / total) * 100);
  const rejectedPct = Math.round((rejected / total) * 100);

  const validGeofenceCount = submissions.filter((s) => s.distance_meters <= s.quest_radius_meters).length;
  const complianceRate = Math.round((validGeofenceCount / total) * 100);

  const avgDistance = Math.round(
    submissions.reduce((acc, s) => acc + s.distance_meters, 0) / total
  );

  // SVG ring circumference for 32px radius: 2 * PI * 32 = ~201
  const circumference = 201;
  const strokeDashoffset = circumference - (complianceRate / 100) * circumference;

  return (
    <div
      style={{
        background: '#FAF9F5',
        border: '1px solid #E3DFD5',
        borderRadius: '16px',
        padding: '18px 20px',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <h4 style={{ fontSize: '14px', fontWeight: 800, color: '#582F0E', margin: 0 }}>
            Moderation Queue Telemetry & Verification Health
          </h4>
          <p style={{ fontSize: '11px', color: '#837560', margin: '2px 0 0 0' }}>
            Visual integrity breakdown across {total} traveler proof submissions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: '#D8F3DC', color: '#2D6A4F' }}>
            ✓ {approved} Approved ({approvedPct}%)
          </span>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: '#FEF3C7', color: '#7D5800' }}>
            ⏳ {pending} Pending ({pendingPct}%)
          </span>
          {rejected > 0 && (
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', background: '#FEE2E2', color: '#BC4749' }}>
              ✕ {rejected} Rejected ({rejectedPct}%)
            </span>
          )}
        </div>
      </div>

      {/* Visual Multi-Segment Status Progress Bar */}
      <div
        style={{
          height: '10px',
          width: '100%',
          background: '#E9E8E4',
          borderRadius: '5px',
          overflow: 'hidden',
          display: 'flex',
          marginBottom: '16px',
        }}
      >
        <div style={{ width: `${approvedPct}%`, background: '#2D6A4F', transition: 'width 0.4s' }} title={`Approved: ${approvedPct}%`} />
        <div style={{ width: `${pendingPct}%`, background: '#FFB703', transition: 'width 0.4s' }} title={`Pending: ${pendingPct}%`} />
        <div style={{ width: `${rejectedPct}%`, background: '#BC4749', transition: 'width 0.4s' }} title={`Rejected: ${rejectedPct}%`} />
      </div>

      {/* Key Metric Highlights Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        {/* Geofence Integrity Compliance Card */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E8E5DE',
            borderRadius: '12px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          {/* Circular SVG Ring */}
          <div style={{ position: 'relative', width: '48px', height: '48px', flexShrink: 0 }}>
            <svg width="48" height="48" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="32" fill="none" stroke="#E9E8E4" strokeWidth="8" />
              <circle
                cx="40"
                cy="40"
                r="32"
                fill="none"
                stroke={complianceRate >= 80 ? '#2D6A4F' : '#BC4749'}
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 800,
                color: '#582F0E',
              }}
            >
              {complianceRate}%
            </div>
          </div>
          <div>
            <span style={{ fontSize: '10px', color: '#837560', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
              Geofence Accuracy
            </span>
            <strong style={{ fontSize: '13px', color: '#582F0E' }}>
              {validGeofenceCount} of {total} in bounds
            </strong>
          </div>
        </div>

        {/* Average Proximity Offset */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E8E5DE',
            borderRadius: '12px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: '#D8F3DC',
              color: '#2D6A4F',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Target size={20} />
          </div>
          <div>
            <span style={{ fontSize: '10px', color: '#837560', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
              Avg Distance Offset
            </span>
            <strong style={{ fontSize: '13px', color: '#582F0E' }}>
              ~{avgDistance} meters
            </strong>
          </div>
        </div>

        {/* Verification Status */}
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #E8E5DE',
            borderRadius: '12px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: pending > 0 ? '#FEF3C7' : '#D8F3DC',
              color: pending > 0 ? '#7D5800' : '#2D6A4F',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {pending > 0 ? <Clock size={20} /> : <CheckCircle2 size={20} />}
          </div>
          <div>
            <span style={{ fontSize: '10px', color: '#837560', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
              Review Backlog
            </span>
            <strong style={{ fontSize: '13px', color: pending > 0 ? '#7D5800' : '#2D6A4F' }}>
              {pending === 0 ? 'Queue Cleared' : `${pending} pending action`}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
}
