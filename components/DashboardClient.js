'use client';

import { useEffect, useMemo, useState } from 'react';

function formatPacificDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
}

function textForSearch(submission) {
  return [
    submission.name,
    submission.location,
    submission.cycleId,
    ...submission.answers.flatMap((answer) => [`Bin ${answer.bin}`, ...answer.styleNames])
  ].join(' ').toLowerCase();
}

export default function DashboardClient() {
  const [submissions, setSubmissions] = useState([]);
  const [selectedCycleId, setSelectedCycleId] = useState('');
  const [locationFilter, setLocationFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);

  async function loadSubmissions(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/dashboard/data', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setExpired(true);
        return;
      }
      if (!response.ok || !data.ok) throw new Error(data.error || 'Dashboard data could not be loaded.');
      const records = Array.isArray(data.submissions) ? data.submissions : [];
      setSubmissions(records);
      setSelectedCycleId((current) => records.some((record) => record.cycleId === current) ? current : (records[0]?.cycleId || ''));
      setExpired(false);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Dashboard data could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadSubmissions();
  }, []);

  const locations = useMemo(() => [...new Set(submissions.map((submission) => submission.location))].sort(), [submissions]);
  const filteredSubmissions = useMemo(() => {
    const term = search.trim().toLowerCase();
    return submissions.filter((submission) => {
      if (locationFilter !== 'all' && submission.location !== locationFilter) return false;
      return !term || textForSearch(submission).includes(term);
    });
  }, [submissions, locationFilter, search]);
  const selectedSubmission = filteredSubmissions.find((submission) => submission.cycleId === selectedCycleId) || filteredSubmissions[0] || null;
  const latestSubmission = submissions[0] || null;

  async function signOut() {
    try {
      await fetch('/api/dashboard/logout', { method: 'POST', cache: 'no-store' });
    } finally {
      window.location.reload();
    }
  }

  if (expired) {
    return (
      <main className="message-shell">
        <section className="message-card">
          <p className="eyebrow">Manager access</p>
          <h1>Your dashboard session expired</h1>
          <p className="message-copy">Sign in again to review the latest bin checks.</p>
          <button className="button button-primary message-home-link" type="button" onClick={() => window.location.reload()}>Sign in again</button>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <img className="brand-logo" src="/ksc-logo.svg" alt="KSC" />
          <div>
            <p className="eyebrow">Manager view · recent 90 days</p>
            <h1>Bin check dashboard</h1>
          </div>
        </div>
        <div className="dashboard-header-actions">
          <button className="button button-outline dashboard-action" type="button" onClick={() => loadSubmissions(true)} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="button button-outline dashboard-action" type="button" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <p className="dashboard-intro">Review associate submissions by location, see bins marked for restock, and find style names at a glance.</p>

      {error && <p className="dashboard-error" role="alert">{error}</p>}

      <section className="dashboard-metrics" aria-label="Submission overview">
        <article className="dashboard-metric">
          <span className="metric-label">Submissions · 90 days</span>
          <strong>{loading ? '—' : submissions.length}</strong>
          <span className="metric-note">Saved bin checks</span>
        </article>
        <article className="dashboard-metric">
          <span className="metric-label">Latest check</span>
          <strong className="metric-date">{latestSubmission ? formatPacificDate(latestSubmission.submittedAt) : loading ? 'Loading…' : 'No checks yet'}</strong>
          <span className="metric-note">Pacific time</span>
        </article>
        <article className="dashboard-metric metric-accent">
          <span className="metric-label">Need restock · latest</span>
          <strong>{latestSubmission ? latestSubmission.neededCount : loading ? '—' : '—'}</strong>
          <span className="metric-note">Bins marked Yes</span>
        </article>
      </section>

      <section className="dashboard-workspace">
        <div className="dashboard-history-panel">
          <div className="dashboard-section-heading">
            <div>
              <p className="eyebrow">Submission history</p>
              <h2>Recent checks</h2>
            </div>
            <span className="history-count">{filteredSubmissions.length}</span>
          </div>
          <div className="dashboard-filters">
            <label className="dashboard-search-label" htmlFor="dashboard-search">Search</label>
            <input
              id="dashboard-search"
              className="form-control dashboard-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, bin or style"
            />
            <label className="dashboard-search-label" htmlFor="dashboard-location">Location</label>
            <select id="dashboard-location" className="form-control dashboard-location-filter" value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
              <option value="all">All locations</option>
              {locations.map((location) => <option key={location} value={location}>{location}</option>)}
            </select>
          </div>

          <div className="dashboard-submission-list" aria-live="polite">
            {loading ? <p className="dashboard-empty">Loading recent submissions…</p> : filteredSubmissions.length ? filteredSubmissions.map((submission) => (
              <button
                className={`dashboard-submission-row ${selectedSubmission?.cycleId === submission.cycleId ? 'dashboard-submission-selected' : ''}`}
                key={submission.cycleId}
                type="button"
                onClick={() => setSelectedCycleId(submission.cycleId)}
                aria-pressed={selectedSubmission?.cycleId === submission.cycleId}
              >
                <span className="submission-row-main">
                  <strong>{submission.name}</strong>
                  <span>{submission.location}</span>
                </span>
                <span className="submission-row-date">{formatPacificDate(submission.submittedAt)}</span>
                <span className="submission-row-count">{submission.neededCount} need restock</span>
              </button>
            )) : <p className="dashboard-empty">{error ? 'History could not be loaded.' : 'No submissions match these filters.'}</p>}
          </div>
        </div>

        <div className="dashboard-detail-panel">
          {selectedSubmission ? (
            <>
              <div className="dashboard-section-heading detail-heading">
                <div>
                  <p className="eyebrow">Selected submission</p>
                  <h2>{selectedSubmission.name}</h2>
                  <p className="detail-subtitle">{selectedSubmission.location} · {formatPacificDate(selectedSubmission.submittedAt)}</p>
                </div>
                {selectedSubmission.updated && <span className="updated-badge">Updated</span>}
              </div>
              <div className="detail-summary-line">
                <span><strong>{selectedSubmission.neededCount}</strong> need restock</span>
                <span><strong>{selectedSubmission.notNeededCount}</strong> no restock</span>
              </div>
              <div className="dashboard-bin-list">
                {selectedSubmission.answers.map((answer) => (
                  <article className="dashboard-bin-row" key={`${selectedSubmission.cycleId}-${answer.bin}`}>
                    <div className="dashboard-bin-name">
                      <strong>{answer.label}</strong>
                      <span>{answer.styleNames.length ? answer.styleNames.join(', ') : 'No style names entered'}</span>
                    </div>
                    <span className={`dashboard-status ${answer.status === 'needed' ? 'dashboard-status-needed' : 'dashboard-status-clear'}`}>
                      {answer.status === 'needed' ? 'Yes · Restock' : 'No · Clear'}
                    </span>
                    {answer.hasPhoto && <span className="dashboard-photo-tag">Photo submitted</span>}
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="dashboard-empty-detail">
              <p className="eyebrow">Submission details</p>
              <h2>Select a recent check</h2>
              <p>Choose a submission from the list to review all bins and style names.</p>
            </div>
          )}
        </div>
      </section>
      <p className="dashboard-footer">KSC · Manager dashboard · Associate form remains OTP-free</p>
    </main>
  );
}
