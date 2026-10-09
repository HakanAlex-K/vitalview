/** Summary statistics for one optical channel: DC level, AC swing, and their ratio. */
export function channelStats(samples, key) {
  if (!samples?.length) return null;
  const values = samples.map((r) => r[key]);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const peakToPeak = Math.max(...values) - Math.min(...values);
  return { mean, peakToPeak, acDc: mean ? (peakToPeak / mean) * 100 : null };
}

/** Rescale values to 0–1 for drawing; a flat channel sits on the midline. */
export function normalize(values) {
  const min = Math.min(...values);
  const range = Math.max(...values) - min;
  return values.map((v) => (range ? (v - min) / range : 0.5));
}
