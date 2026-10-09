import React from 'react';

export function Badge({ children, tone = 'neutral', dot = false }) {
  return (
    <span className={'badge ' + tone}>
      {dot && <i className="badge-dot" />}
      {children}
    </span>
  );
}

export const statusTone = (status) =>
  status === 'estimated' ? 'ok' : status === 'error' || status === 'invalid' ? 'err' : 'warn';

export function StatusBadge({ status, children }) {
  return (
    <Badge tone={statusTone(status)} dot>
      {children}
    </Badge>
  );
}
