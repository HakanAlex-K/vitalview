import React from 'react';
import { ChevronRight, FlaskConical, Moon, Settings2, Sun } from 'lucide-react';
import { BrandMark } from './Sidebar.jsx';

function StatusPill({ demo, online, processing }) {
  const [tone, label] = demo
    ? ['accent', 'Demo data']
    : !online
      ? ['off', 'Backend offline']
      : processing
        ? ['busy', 'Processing capture']
        : ['live', 'Backend online'];
  return (
    <span className={'status-pill ' + tone} role="status">
      <i />
      {label}
    </span>
  );
}

export function Topbar({ pageLabel, status, theme, onToggleTheme, onOpenSettings }) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-brand">
          <BrandMark />
        </span>
        <span className="crumb">Workspace</span>
        <ChevronRight size={14} className="crumb-sep" />
        <span className="crumb-current">{pageLabel}</span>
      </div>
      <div className="topbar-right">
        <StatusPill {...status} />
        <span className="research-tag">
          <FlaskConical size={14} />
          Research prototype
        </span>
        <button
          className="icon-button"
          aria-label={`Switch to ${nextTheme} theme`}
          title={`Switch to ${nextTheme} theme`}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button
          className="icon-button"
          aria-label="Open connection settings"
          title="Connection settings"
          onClick={onOpenSettings}
        >
          <Settings2 size={17} />
        </button>
      </div>
    </header>
  );
}
