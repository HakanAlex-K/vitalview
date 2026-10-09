const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const formatTime = (date) =>
  new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Show a dash rather than a placeholder number when no usable reading exists. */
export const formatValue = (value) => (value == null ? '—' : numberFormat.format(value));

export const formatInteger = (value) => (value == null ? '—' : integerFormat.format(value));

export const statusLabel = (status) => status.replaceAll('_', ' ');

export function sourceLabel(source) {
  if (source === 'synthetic') return 'Demo capture';
  if (source === 'import') return 'CSV import';
  if (source === 'simulator') return 'Simulator upload';
  return 'Device capture';
}
