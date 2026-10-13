import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  RefreshCw, 
  Search, 
  Filter, 
  ExternalLink,
  MapPin,
  Mail,
  Phone,
  Tag,
  History,
  FileText
} from 'lucide-react';

interface AffiliateApplication {
  id: string;
  user_id: string;
  business_name: string;
  category: string;
  municipality: string;
  business_address?: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  preferred_contact_method?: string;
  sponsorship_goals: string[];
  proposal_details?: string;
  status: 'received' | 'in_review' | 'approved' | 'rejected' | 'needs_changes';
  version?: number;
  reviewer_id?: string | null;
  reviewer_notes?: string | null;
  applicant_feedback?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at: string;
  audits?: {
    id: string;
    from_status: string;
    to_status: string;
    revision: number;
    notes?: string | null;
    applicant_feedback?: string | null;
    created_at: string;
  }[];
}

interface AffiliateReviewCenterProps {
  token: string;
  apiBase: string;
}

export function AffiliateReviewCenter({ token, apiBase }: AffiliateReviewCenterProps) {
  const [applications, setApplications] = useState<AffiliateApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected application for detail modal
  const [selectedApp, setSelectedApp] = useState<AffiliateApplication | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Review decision states
  const [decisionAction, setDecisionAction] = useState<'approved' | 'needs_changes' | 'rejected' | 'in_review' | null>(null);
  const [internalNotes, setInternalNotes] = useState('');
  const [applicantFeedback, setApplicantFeedback] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const fetchApplications = async () => {
    try {
      setLoading(true);
      setError(null);
      const url = statusFilter === 'all' 
        ? `${apiBase}/admin/affiliate/applications`
        : `${apiBase}/admin/affiliate/applications?status=${statusFilter}`;
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to load affiliate applications');
      }
      setApplications(data.data);
    } catch (err: any) {
      setError(err.message || 'Unable to connect to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [statusFilter]);

  const openDetailModal = async (app: AffiliateApplication) => {
    setSelectedApp(app);
    setDecisionAction(null);
    setInternalNotes('');
    setApplicantFeedback('');
    setDecisionError(null);

    // Fetch full audit history
    try {
      setDetailLoading(true);
      const res = await fetch(`${apiBase}/admin/affiliate/applications/${app.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedApp(data.data);
      }
    } catch {
      // fallback to current row
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDecisionSubmit = async () => {
    if (!selectedApp || !decisionAction) return;

    if (decisionAction === 'needs_changes' && !applicantFeedback.trim()) {
      setDecisionError('Applicant-safe feedback is required when requesting revisions.');
      return;
    }
    if (decisionAction === 'rejected' && !internalNotes.trim() && !applicantFeedback.trim()) {
      setDecisionError('Please provide a reason for application rejection.');
      return;
    }

    try {
      setSubmittingDecision(true);
      setDecisionError(null);

      const res = await fetch(`${apiBase}/admin/affiliate/applications/${selectedApp.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: decisionAction,
          reviewer_notes: internalNotes.trim() || undefined,
          applicant_feedback: applicantFeedback.trim() || undefined,
          expected_version: selectedApp.version,
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to update application review');
      }

      // Update local listing
      setApplications(prev => prev.map(a => a.id === selectedApp.id ? data.data : a));
      setSelectedApp(null);
      setDecisionAction(null);
    } catch (err: any) {
      setDecisionError(err.message || 'Review submission failed');
    } finally {
      setSubmittingDecision(false);
    }
  };

  const filteredApplications = applications.filter(a => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.business_name.toLowerCase().includes(q) ||
      a.municipality.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.contact_name.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'received':
        return <span style={{ padding: '4px 8px', borderRadius: '12px', background: '#dbeafe', color: '#1e40af', fontSize: '12px', fontWeight: 600 }}>Received</span>;
      case 'in_review':
        return <span style={{ padding: '4px 8px', borderRadius: '12px', background: '#fef3c7', color: '#92400e', fontSize: '12px', fontWeight: 600 }}>In Review</span>;
      case 'approved':
        return <span style={{ padding: '4px 8px', borderRadius: '12px', background: '#dcfce7', color: '#166534', fontSize: '12px', fontWeight: 600 }}>Approved</span>;
      case 'needs_changes':
        return <span style={{ padding: '4px 8px', borderRadius: '12px', background: '#ffedd5', color: '#9a3412', fontSize: '12px', fontWeight: 600 }}>Needs Changes</span>;
      case 'rejected':
        return <span style={{ padding: '4px 8px', borderRadius: '12px', background: '#fee2e2', color: '#991b1b', fontSize: '12px', fontWeight: 600 }}>Rejected</span>;
      default:
        return <span style={{ padding: '4px 8px', borderRadius: '12px', background: '#f3f4f6', color: '#374151', fontSize: '12px' }}>{status}</span>;
    }
  };

  return (
    <div style={{ background: '#fbf9f5', borderRadius: '16px', padding: '24px', border: '1px solid #d5c4ac' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1B4332', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Building2 size={24} color="#2D6A4F" /> Merchant Affiliate Applications
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '14px' }}>
            Review local Pangasinan tourism businesses, request adjustments, and provision verified merchant workspaces.
          </p>
        </div>
        <button
          onClick={fetchApplications}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid #c9bda8',
            background: '#fff',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            color: '#1B4332'
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #c9bda8', borderRadius: '8px', padding: '6px 12px', flex: '1 1 250px' }}>
          <Search size={16} color="#888" />
          <input
            type="text"
            placeholder="Search business, town, category, or owner..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {['all', 'received', 'in_review', 'needs_changes', 'approved', 'rejected'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: statusFilter === st ? '#2D6A4F' : '#d5c4ac',
                background: statusFilter === st ? '#2D6A4F' : '#fff',
                color: statusFilter === st ? '#fff' : '#444',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', marginBottom: '16px', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Applications Table */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading applications...</div>
      ) : filteredApplications.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#777', background: '#fff', borderRadius: '12px', border: '1px dashed #c9bda8' }}>
          No affiliate applications found for this filter.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: '12px', border: '1px solid #e0d8ca' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f5f1ea', borderBottom: '1px solid #e0d8ca', color: '#555' }}>
                <th style={{ padding: '12px 16px' }}>Business</th>
                <th style={{ padding: '12px 16px' }}>Category & Locality</th>
                <th style={{ padding: '12px 16px' }}>Contact</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Submitted</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredApplications.map((app) => (
                <tr key={app.id} style={{ borderBottom: '1px solid #f0eae1' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#1B4332' }}>{app.business_name}</div>
                    <div style={{ fontSize: '11px', color: '#777' }}>ID: {app.id} • v{app.version || 1}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ textTransform: 'capitalize', fontWeight: 500 }}>{app.category}</div>
                    <div style={{ fontSize: '12px', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={12} /> {app.municipality}
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <div>{app.contact_name}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>{app.contact_email}</div>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {getStatusBadge(app.status)}
                  </td>
                  <td style={{ padding: '14px 16px', color: '#666', fontSize: '12px' }}>
                    {new Date(app.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <button
                      onClick={() => openDetailModal(app)}
                      style={{
                        padding: '6px 12px',
                        background: '#1B4332',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 600,
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review & Detail Modal */}
      {selectedApp && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '750px',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #eee', paddingBottom: '16px', marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Affiliate Application Review</span>
                <h3 style={{ margin: '4px 0 0 0', fontSize: '22px', fontWeight: 700, color: '#1B4332' }}>{selectedApp.business_name}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  {getStatusBadge(selectedApp.status)}
                  <span style={{ fontSize: '12px', color: '#666' }}>Revision {selectedApp.version || 1}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedApp(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#888' }}
              >
                ✕
              </button>
            </div>

            {/* Application Details Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div style={{ background: '#fbf9f5', padding: '12px', borderRadius: '8px', border: '1px solid #ebdccb' }}>
                <span style={{ fontSize: '11px', color: '#888', fontWeight: 600 }}>LOCATION & CATEGORY</span>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#333', marginTop: '4px' }}>{selectedApp.municipality}, Pangasinan</div>
                <div style={{ fontSize: '12px', color: '#666' }}>Category: {selectedApp.category}</div>
                {selectedApp.business_address && (
                  <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>Address: {selectedApp.business_address}</div>
                )}
              </div>

              <div style={{ background: '#fbf9f5', padding: '12px', borderRadius: '8px', border: '1px solid #ebdccb' }}>
                <span style={{ fontSize: '11px', color: '#888', fontWeight: 600 }}>CONTACT INFORMATION</span>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#333', marginTop: '4px' }}>{selectedApp.contact_name}</div>
                <div style={{ fontSize: '12px', color: '#666' }}><Mail size={12} style={{ display: 'inline', marginRight: 4 }} /> {selectedApp.contact_email}</div>
                <div style={{ fontSize: '12px', color: '#666' }}><Phone size={12} style={{ display: 'inline', marginRight: 4 }} /> {selectedApp.contact_phone}</div>
              </div>
            </div>

            {/* Goals & Proposal */}
            <div style={{ marginBottom: '20px' }}>
              <span style={{ fontSize: '11px', color: '#888', fontWeight: 600 }}>SPONSORSHIP GOALS</span>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                {selectedApp.sponsorship_goals.map(g => (
                  <span key={g} style={{ padding: '4px 10px', background: '#e8f5e9', color: '#2e7d32', borderRadius: '12px', fontSize: '12px', fontWeight: 500 }}>
                    {g.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>

            {selectedApp.proposal_details && (
              <div style={{ marginBottom: '20px', background: '#f9fafb', padding: '12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', color: '#888', fontWeight: 600 }}>PROPOSAL DETAILS</span>
                <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#333', lineHeight: 1.5 }}>{selectedApp.proposal_details}</p>
              </div>
            )}

            {/* Applicant Safe Feedback (If already present) */}
            {selectedApp.applicant_feedback && (
              <div style={{ marginBottom: '20px', background: '#fff7ed', border: '1px solid #ffedd5', padding: '12px', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', color: '#c2410c', fontWeight: 600 }}>CURRENT FEEDBACK SENT TO APPLICANT</span>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#9a3412' }}>{selectedApp.applicant_feedback}</p>
              </div>
            )}

            {/* Audits History */}
            {selectedApp.audits && selectedApp.audits.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <span style={{ fontSize: '11px', color: '#888', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <History size={12} /> AUDIT HISTORY & DECISION TIMELINE
                </span>
                <div style={{ marginTop: '8px', borderLeft: '2px solid #ddd', paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedApp.audits.map((aud) => (
                    <div key={aud.id} style={{ fontSize: '12px', color: '#555' }}>
                      <span style={{ fontWeight: 600 }}>{aud.from_status} → {aud.to_status}</span> (rev {aud.revision})
                      <span style={{ color: '#999', marginLeft: '6px' }}>{new Date(aud.created_at).toLocaleString()}</span>
                      {aud.notes && <div style={{ color: '#444', fontStyle: 'italic', marginTop: '2px' }}>Note: {aud.notes}</div>}
                      {aud.applicant_feedback && <div style={{ color: '#c2410c', marginTop: '2px' }}>Feedback: {aud.applicant_feedback}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Decision Controls */}
            <div style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700, color: '#1B4332' }}>Admin Decision</h4>
              
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setDecisionAction('approved')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #166534',
                    background: decisionAction === 'approved' ? '#166534' : '#fff',
                    color: decisionAction === 'approved' ? '#fff' : '#166534',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  ✓ Approve & Provision Workspace
                </button>

                <button
                  type="button"
                  onClick={() => setDecisionAction('needs_changes')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #c2410c',
                    background: decisionAction === 'needs_changes' ? '#c2410c' : '#fff',
                    color: decisionAction === 'needs_changes' ? '#fff' : '#c2410c',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  ⚠ Request Revisions
                </button>

                <button
                  type="button"
                  onClick={() => setDecisionAction('rejected')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #991b1b',
                    background: decisionAction === 'rejected' ? '#991b1b' : '#fff',
                    color: decisionAction === 'rejected' ? '#fff' : '#991b1b',
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  ✕ Reject Application
                </button>
              </div>

              {decisionAction && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {decisionAction === 'needs_changes' && (
                    <div>
                      <label style={{ fontSize: '12px', fontWeight: 600, color: '#333', display: 'block', marginBottom: '4px' }}>
                        Applicant-Visible Instructions (Required):
                      </label>
                      <textarea
                        rows={3}
                        placeholder="Explain what information or documents the applicant must revise before approval..."
                        value={applicantFeedback}
                        onChange={(e) => setApplicantFeedback(e.target.value)}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #c9bda8', fontSize: '13px' }}
                      />
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#333', display: 'block', marginBottom: '4px' }}>
                      Internal Reviewer Notes (Private to Admin Team):
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Optional internal audit verification details, site visit observations, or permit notes..."
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #c9bda8', fontSize: '13px' }}
                    />
                  </div>

                  {decisionError && (
                    <div style={{ color: '#991b1b', fontSize: '13px' }}>{decisionError}</div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setDecisionAction(null)}
                      style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: '13px' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDecisionSubmit}
                      disabled={submittingDecision}
                      style={{
                        padding: '8px 20px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#1B4332',
                        color: '#fff',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '13px'
                      }}
                    >
                      {submittingDecision ? 'Submitting...' : 'Confirm Decision'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
