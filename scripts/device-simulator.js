// Software transport check only. These are generated samples, never real readings.
const base = process.env.VITALVIEW_URL || 'http://127.0.0.1:8787';
const headers = {
  'Content-Type': 'application/json',
  ...(process.env.API_TOKEN ? { Authorization: `Bearer ${process.env.API_TOKEN}` } : {}),
};
const data = Array.from({ length: 300 }, (_, i) => ({
  ir: Math.round(21000 + 260 * Math.sin(i * 0.29)),
  red: Math.round(19900 + 185 * Math.sin(i * 0.29)),
}));
console.log(
  'SIMULATOR: synthetic samples; model rejection is expected if outside its training domain.',
);
const r = await fetch(base + '/glucose', {
  method: 'POST',
  headers,
  body: JSON.stringify({ data, simulated: true }),
});
const capture = await r.json();
if (![200, 422].includes(r.status)) throw new Error(capture.error || `HTTP ${r.status}`);
const stateResponse = await fetch(base + '/api/state', { headers });
if (!stateResponse.ok) throw new Error(`State HTTP ${stateResponse.status}`);
const state = await stateResponse.json();
if (state.latest?.id !== capture.id) throw new Error('Dashboard state does not match upload');
console.log(
  `Transport verified: ${capture.id}, ${capture.status}. Open Device mode to see this synthetic upload.`,
);
