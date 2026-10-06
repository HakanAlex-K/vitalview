import React from 'react';

export function Badge({ children, tone = '' }) {
  return <span className={'badge ' + tone}>{children}</span>;
}

export function StatusBadge({ status, children }) {
  return <Badge tone={status === 'estimated' ? 'green' : 'orange'}>{children}</Badge>;
}
