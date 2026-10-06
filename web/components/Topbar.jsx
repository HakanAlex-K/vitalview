import React from 'react';
import { ChevronRight, FlaskConical, Settings2 } from 'lucide-react';

export function Topbar({ pageLabel, onOpenSettings }) {
  return (
    <header className="topbar">
      <div>
        <span className="crumb">Workspace</span>
        <ChevronRight size={13} />
        <span>{pageLabel}</span>
      </div>
      <div className="top-right">
        <span className="research-label">
          <FlaskConical size={14} />
          Research prototype
        </span>
        <button
          className="icon-button"
          aria-label="Open connection settings"
          onClick={onOpenSettings}
        >
          <Settings2 size={18} />
        </button>
        <span className="avatar">HK</span>
      </div>
    </header>
  );
}
