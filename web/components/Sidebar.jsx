import React from 'react';
import { Activity, Settings2, Trophy } from 'lucide-react';
import { PAGES } from '../lib/pages.js';

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <Activity size={17} strokeWidth={2.6} />
    </span>
  );
}

export function Sidebar({ page, onNavigate, sessionCount, onOpenSettings }) {
  return (
    <aside className="sidebar">
      <a
        href="#"
        className="brand"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('overview');
        }}
      >
        <BrandMark />
        <span className="brand-name">vitalview</span>
      </a>
      <nav aria-label="Primary">
        <span className="nav-heading">Workspace</span>
        {PAGES.map(({ key, Icon, label }) => (
          <button
            key={key}
            className={page === key ? 'nav-item active' : 'nav-item'}
            aria-current={page === key ? 'page' : undefined}
            onClick={() => onNavigate(key)}
          >
            <Icon size={18} />
            <span className="nav-label">{label}</span>
            {key === 'sessions' && sessionCount > 0 && (
              <span className="nav-count" aria-hidden="true">
                {sessionCount}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-foot">
        <div className="award">
          <span className="award-icon">
            <Trophy size={16} />
          </span>
          <div>
            <strong>1st place</strong>
            <span>Drexel Freshman Design</span>
          </div>
        </div>
        <button className="nav-item settings" onClick={onOpenSettings}>
          <Settings2 size={18} />
          <span className="nav-label">Connection settings</span>
        </button>
        <div className="profile">
          <span className="avatar">HK</span>
          <div>
            <strong>Hakan Kucukhuseyin</strong>
            <small>Drexel · Computer Engineering</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
