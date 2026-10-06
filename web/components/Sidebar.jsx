import React from 'react';
import { Activity, ArrowUpRight, Settings2, Trophy } from 'lucide-react';
import { PAGES } from '../lib/pages.js';

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
        <span className="brand-mark">
          <Activity size={22} />
        </span>
        vitalview<span className="brand-dot">®</span>
      </a>
      <span className="workspace-label">RESEARCH WORKSPACE</span>
      <nav aria-label="Primary">
        {PAGES.map(({ key, Icon, label }) => (
          <button
            key={key}
            className={page === key ? 'nav-item active' : 'nav-item'}
            onClick={() => onNavigate(key)}
          >
            <Icon size={18} />
            {label}
            {key === 'sessions' && (
              <span className="nav-count" aria-hidden="true">
                {sessionCount}
              </span>
            )}
          </button>
        ))}
      </nav>
      <div className="sidebar-project">
        <span className="tiny-label">THE PROJECT</span>
        <p>
          From a light signal
          <br />
          to a learning system.
        </p>
        <div className="project-chips">
          <span>ESP32</span>
          <span>Optical PPG</span>
          <span>Neural network</span>
        </div>
        <button className="text-button" onClick={() => onNavigate('model')}>
          Explore the architecture <ArrowUpRight size={14} />
        </button>
      </div>
      <div className="award">
        <Trophy size={21} />
        <div>
          <strong>1st place</strong>
          <span>Drexel Freshman Design</span>
        </div>
      </div>
      <button className="nav-item settings" onClick={onOpenSettings}>
        <Settings2 size={18} />
        Connection settings
      </button>
      <div className="profile">
        <span>HK</span>
        <div>
          <strong>Hakan Kucukhuseyin</strong>
          <small>Drexel · Computer Engineering</small>
        </div>
      </div>
    </aside>
  );
}
