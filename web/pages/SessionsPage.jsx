import React from 'react';
import { ArrowRight, ArrowUpRight, Download, History, RefreshCw } from 'lucide-react';
import { Badge, StatusBadge } from '../components/Badge.jsx';
import { formatTime, formatValue, statusLabel } from '../lib/format.js';

const FILTERS = ['all', 'accepted', 'rejected'];

const matchesFilter = (row, filter) =>
  filter === 'all' ||
  (filter === 'accepted' ? row.status === 'estimated' : row.status !== 'estimated');

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

  return (
    <section className="panel sessions-panel">
      <div className="panel-heading">
        <div>
          <h2>
            Capture log <Badge>{sessions.length}</Badge>
          </h2>
          <p>Anonymous, in-memory records. Nothing is saved to a patient database.</p>
        </div>
        <button className="secondary" onClick={onExport} disabled={!sessions.length}>
          <Download size={15} />
          Export CSV
        </button>
      </div>
      <div className="table-toolbar">
        <div className="segmented">
          {FILTERS.map((value) => (
            <button
              key={value}
              className={filter === value ? 'chosen' : ''}
              onClick={() => onFilterChange(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        {demo && (
          <button className="text-button" onClick={onClearDemo} disabled={!sessions.length}>
            <RefreshCw size={14} />
            Clear demo
          </button>
        )}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>CAPTURE</th>
              <th>RECEIVED</th>
              <th>SOURCE</th>
              <th>RESULT</th>
              <th>ESTIMATE</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>Capture {captureNumber(r)}</strong>
                  <small>{r.id.slice(0, 8)}</small>
                </td>
                <td>{formatTime(r.receivedAt)}</td>
                <td>{r.source}</td>
                <td>
                  <StatusBadge status={r.status}>{statusLabel(r.status)}</StatusBadge>
                </td>
                <td>
                  {formatValue(r.estimate)}{' '}
                  {r.estimate != null && <small>label units · experimental</small>}
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={`Inspect capture ${captureNumber(r)}`}
                    onClick={() => onSelect(r)}
                  >
                    <ArrowUpRight size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="empty">
          <History size={35} />
          <h3>No captures {filter === 'all' ? 'yet' : `marked ${filter}`}</h3>
          <p>
            {filter === 'all'
              ? 'Start with an optical capture in the overview.'
              : 'Try another filter or capture a new signal.'}
          </p>
          <button className="secondary" onClick={() => onNavigate('overview')}>
            Back to overview <ArrowRight size={15} />
          </button>
        </div>
      )}
    </section>
  );
}
