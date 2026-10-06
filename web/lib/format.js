const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export const formatTime = (date) =>
  new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Show a dash rather than a placeholder number when no usable reading exists. */
export const formatValue = (value) => (value == null ? '—' : numberFormat.format(value));

export const statusLabel = (status) => status.replaceAll('_', ' ');
