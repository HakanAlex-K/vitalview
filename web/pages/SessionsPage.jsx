import React from 'react';
import { ArrowRight, ArrowUpRight, Download, History, RefreshCw } from 'lucide-react';
import { Badge, StatusBadge } from '../components/Badge.jsx';
import { formatTime, formatValue, sourceLabel, statusLabel } from '../lib/format.js';

const FILTERS = ['all', 'accepted', 'rejected'];

const matchesFilter = (row, filter) =>
  filter === 'all' ||
  (filter === 'accepted' ? row.status === 'estimated' : row.status !== 'estimated');

function SessionStats({ sessions }) {
  const estimates = sessions.filter((r) => r.status === 'estimated').map((r) => r.estimate);
  const rejected = sessions.length - estimates.length;
  const mean = estimates.length ? estimates.reduce((a, b) => a + b, 0) / estimates.length : null;
  const rate = sessions.length ? Math.round((estimates.length / sessions.length) * 100) : null;
  const tiles = [
    ['Captures', sessions.length, 'In this session'],
    ['Accepted', estimates.length, rate == null ? 'No captures yet' : `${rate}% acceptance`],
    ['Rejected', rejected, 'Failed quality or model checks'],
    ['Mean estimate', formatValue(mean), 'Accepted captures · label units'],
  ];
  return (
    <div className="stat-tiles">
      {tiles.map(([label, value, detail]) => (
        <div className="stat-tile" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{detail}</small>
        </div>
      ))}
    </div>
  );
}

export function SessionsPage({
  demo,
  sessions,
  filter,
  onFilterChange,
  onExport,
  onClearDemo,
  onSelect,
  onNavigate,
}) {
  const rows = sessions.filter((row) => matchesFilter(row, filter));
  // Number captures by arrival order so labels stay stable while filtering.
  const captureNumber = (row) => sessions.length - sessions.indexOf(row);
  const count = (value) => sessions.filter((row) => matchesFilter(row, value)).length;

  return (
    <>
      <SessionStats sessions={sessions} />
      <section className="panel sessions-panel">
        <div className="panel-head">
          <div>
            <h2>
              Capture log <Badge>{sessions.length}</Badge>
            </h2>
            <p>Anonymous, in-memory records. Nothing is saved to a patient database.</p>
          </div>
          <div className="head-actions">
            {demo && (
              <button className="btn ghost" onClick={onClearDemo} disabled={!sessions.length}>
                <RefreshCw size={14} />
                Clear demo
              </button>
            )}
            <button className="btn secondary" onClick={onExport} disabled={!sessions.length}>
              <Download size={15} />
              Export CSV
            </button>
          </div>
        </div>
        <div className="table-toolbar">
          <div className="segmented" role="group" aria-label="Filter captures">
            {FILTERS.map((value) => (
              <button
                key={value}
                className={filter === value ? 'chosen' : ''}
                aria-pressed={filter === value}
                onClick={() => onFilterChange(value)}
              >
                {value[0].toUpperCase() + value.slice(1)}
                <span className="segment-count">{count(value)}</span>
              </button>
            ))}
          </div>
        </div>
        {rows.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Capture</th>
                  <th>Received</th>
                  <th>Source</th>
                  <th>Result</th>
                  <th className="num">Estimate</th>
                  <th>
                    <span className="visually-hidden">Inspect</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => onSelect(r)}>
                    <td>
                      <strong>Capture {captureNumber(r)}</strong>
                      <code>{r.id.slice(0, 8)}</code>
                    </td>
                    <td className="mono">{formatTime(r.receivedAt)}</td>
                    <td>{sourceLabel(r.source)}</td>
                    <td>
                      <StatusBadge status={r.status}>{statusLabel(r.status)}</StatusBadge>
                    </td>
                    <td className="num">
                      <strong>{formatValue(r.estimate)}</strong>
                      {r.estimate != null && <small>label units · experimental</small>}
                    </td>
                    <td className="action">
                      <button
                        className="icon-button"
                        aria-label={`Inspect capture ${captureNumber(r)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(r);
                        }}
                      >
                        <ArrowUpRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!rows.length && (
          <div className="empty">
            <span className="empty-icon">
              <History size={24} />
            </span>
            <h3>No captures {filter === 'all' ? 'yet' : `marked ${filter}`}</h3>
            <p>
              {filter === 'all'
                ? 'Start with an optical capture in the overview.'
                : 'Try another filter or capture a new signal.'}
            </p>
            <button className="btn secondary" onClick={() => onNavigate('overview')}>
              Back to overview <ArrowRight size={15} />
            </button>
          </div>
        )}
      </section>
    </>
  );
}
