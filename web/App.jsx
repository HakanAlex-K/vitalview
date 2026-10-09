import React, { useEffect, useRef, useState } from 'react';
import { Check, FlaskConical, TriangleAlert } from 'lucide-react';
import benchmark from './benchmark.json';
import { CaptureDialog } from './components/CaptureDialog.jsx';
import { ConnectionNotice, PageHeader } from './components/PageHeader.jsx';
import { SettingsDialog } from './components/SettingsDialog.jsx';
import { Sidebar } from './components/Sidebar.jsx';
import { Topbar } from './components/Topbar.jsx';
import { useDialogFocusTrap } from './hooks/useDialogFocusTrap.js';
import { useTheme } from './hooks/useTheme.js';
import { DEMO_ESTIMATE, syntheticWave } from './lib/demo.js';
import { download } from './lib/download.js';
import { pageInfo } from './lib/pages.js';
import { ModelPage } from './pages/ModelPage.jsx';
import { OverviewPage } from './pages/OverviewPage.jsx';
import { SessionsPage } from './pages/SessionsPage.jsx';

const POLL_INTERVAL_MS = 3000;
const REQUEST_TIMEOUT_MS = 18000;
const MAX_SESSIONS = 100;
const MAX_CSV_BYTES = 100000;

// A file:// page or the portable build has no backend to talk to, so it opens in demo mode.
const initialMode = () =>
  location.protocol === 'file:' || document.documentElement.dataset.demo === 'true'
    ? 'demo'
    : 'live';

/** Parse a 300-row `ir,red` CSV (header optional) into validated sample pairs. */
function parseOpticalCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (/^ir\s*,\s*red$/i.test(lines[0].trim())) lines.shift();
  const data = lines.map((line) => {
    const parts = line.split(',').map((x) => x.trim());
    if (parts.length !== 2 || parts.some((x) => !x)) throw new Error('Use two columns: ir,red.');
    return { ir: Number(parts[0]), red: Number(parts[1]) };
  });
  if (
    data.length !== 300 ||
    data.some((r) => Object.values(r).some((v) => !Number.isFinite(v) || v < 0 || v > 262143))
  )
    throw new Error('Expected exactly 300 numeric IR/red pairs (0–262143).');
  return data;
}

export function App() {
  const [page, setPage] = useState('overview');
  const [mode, setMode] = useState(initialMode);
  const [scenario, setScenario] = useState('steady');
  const [channel, setChannel] = useState('both');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sessions, setSessions] = useState([]);
  const [capture, setCapture] = useState(null);
  const [device, setDevice] = useState(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [api, setApi] = useState('');
  const [token, setToken] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState('');
  const [importing, setImporting] = useState(false);
  const [liveReport, setLiveReport] = useState(null);
  const [connection, setConnection] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const [theme, toggleTheme] = useTheme();

  const fileRef = useRef();
  const demoTimer = useRef(null);
  // Bumped on every mode switch so late responses from an abandoned connection are ignored.
  const generation = useRef(0);
  // Last applied backend revision, scoped to one server process (serverSession).
  const revision = useRef(-1);
  const serverSession = useRef(null);
  const importController = useRef(null);

  const demo = mode === 'demo';
  const report = demo ? benchmark : liveReport;
  // The trained concentration levels; the bundled report stands in until the live one loads.
  const labelLevels = Object.keys((report ?? benchmark).labels).map(Number);

  const request = async (path, options = {}) => {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const r = await fetch(api + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      signal,
    });
    const d = await r.json();
    // 422 carries a structured capture rejection, which the UI displays rather than throws.
    if (!r.ok && r.status !== 422)
      throw new Error(d.error || d.reason || `Request failed (${r.status})`);
    return d;
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(
    () => () => {
      clearInterval(demoTimer.current);
      importController.current?.abort();
    },
    [],
  );

  useDialogFocusTrap(settingsOpen || Boolean(selected), () => {
    setSettingsOpen(false);
    setSelected(null);
  });

  useEffect(() => {
    if (mode !== 'live') return;
    let active = true;
    const controller = new AbortController();
    setLiveReport(null);
    request('/api/model', { signal: controller.signal })
      .then((d) => {
        if (active) setLiveReport(d);
      })
      .catch(() => {});
    return () => {
      active = false;
      controller.abort();
    };
  }, [mode, api, token, connectionEpoch]);

  useEffect(() => {
    if (mode !== 'live') return;
    let active = true;
    let timer;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const d = await request('/api/state', { signal: controller.signal });
        if (!active) return;
        setOnline(true);
        setError('');
        // A new sessionId means the server restarted and its revision counter reset.
        if (d.sessionId !== serverSession.current) {
          serverSession.current = d.sessionId;
          revision.current = -1;
          setSelected(null);
        }
        if (d.revision >= revision.current) {
          revision.current = d.revision;
          setCapture(d.latest);
          setSessions(d.sessions || []);
        }
        setDevice(d.vitals);
        setConnection(d.deviceStatus);
        setProcessing(d.busy);
      } catch (e) {
        if (active) {
          setOnline(false);
          setCapture(null);
          setDevice(null);
          setSessions([]);
          setConnection(null);
          setProcessing(false);
          setError(e.message);
        }
      } finally {
        if (active) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [mode, api, token, connectionEpoch]);

  function switchMode(next) {
    generation.current++;
    revision.current = -1;
    serverSession.current = null;
    importController.current?.abort();
    setImporting(false);
    setConnectionEpoch((n) => n + 1);
    setOnline(false);
    setConnection(null);
    setProcessing(false);
    clearInterval(demoTimer.current);
    setRunning(false);
    setProgress(0);
    setCapture(null);
    setDevice(null);
    setSessions([]);
    setSelected(null);
    setError('');
    setMode(next);
  }

  function toggleDemoCapture() {
    if (running) {
      clearInterval(demoTimer.current);
      setRunning(false);
      return;
    }
    const lowSignal = scenario === 'poor';
    setProgress(0);
    setRunning(true);
    let p = 0;
    demoTimer.current = setInterval(() => {
      p += 5;
      setProgress(p);
      if (p < 100) return;
      clearInterval(demoTimer.current);
      setRunning(false);
      const row = {
        id: crypto.randomUUID?.() ?? `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        receivedAt: new Date().toISOString(),
        source: 'synthetic',
        status: lowSignal ? 'rejected' : 'estimated',
        estimate: lowSignal ? null : DEMO_ESTIMATE,
        samples: syntheticWave(lowSignal),
        quality: {
          accepted: !lowSignal,
          reasons: lowSignal ? ['Low optical signal / check sample positioning'] : [],
        },
      };
      setCapture(row);
      setSessions((s) => [row, ...s].slice(0, MAX_SESSIONS));
      setToast(
        lowSignal
          ? 'Low-signal demo rejected. No estimate produced.'
          : 'Synthetic capture added to this session.',
      );
    }, 500);
  }

  function exportSession() {
    if (!sessions.length) return;
    download(
      'vitalview-session.csv',
      'id,timestamp,source,status,experimental_estimate\n' +
        sessions
          .map((r) => [r.id, r.receivedAt, r.source, r.status, r.estimate ?? ''].join(','))
          .join('\n'),
    );
    setToast('Session CSV exported');
  }

  async function importCsv(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const gen = generation.current;
    const controller = new AbortController();
    importController.current = controller;
    setImporting(true);
    try {
      if (file.size > MAX_CSV_BYTES) throw new Error('CSV must be under 100 KB.');
      const text = await file.text();
      if (gen !== generation.current) return;
      const data = parseOpticalCsv(text);
      const d = await request('/api/acquisitions', {
        method: 'POST',
        body: JSON.stringify({ data }),
        signal: controller.signal,
      });
      if (gen !== generation.current) return;
      if (d.revision >= revision.current) {
        revision.current = d.revision;
        setCapture(d);
        setSessions((rows) =>
          [{ ...d, samples: undefined }, ...rows.filter((r) => r.id !== d.id)].slice(
            0,
            MAX_SESSIONS,
          ),
        );
      }
      setToast(
        d.status === 'estimated'
          ? 'Experimental inference completed.'
          : 'Capture rejected: ' + (d.reason || d.quality?.reasons?.join(', ') || d.error),
      );
      setError('');
    } catch (e) {
      if (gen === generation.current) setError(e.message);
    } finally {
      if (gen === generation.current) {
        setImporting(false);
        importController.current = null;
      }
    }
  }

  // Session rows hold metadata only; reuse the latest capture when it carries the waveform.
  const selectCapture = (row) => setSelected(capture?.id === row.id ? capture : row);
  const openSettings = () => setSettingsOpen(true);
  const current = pageInfo(page);

  return (
    <div className="shell">
      <Sidebar
        page={page}
        onNavigate={setPage}
        sessionCount={sessions.length}
        onOpenSettings={openSettings}
      />
      <main>
        <Topbar
          pageLabel={current.label}
          status={{ demo, online, processing }}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSettings={openSettings}
        />
        <div className="content">
          <PageHeader
            title={current.title}
            subtitle={current.subtitle}
            demo={demo}
            onSwitchMode={switchMode}
          />
          <ConnectionNotice
            demo={demo}
            online={online}
            simulated={capture?.source === 'simulator'}
            onConnect={() => switchMode('live')}
            onConfigure={openSettings}
          />
          {error && (
            <div className="error" role="alert">
              <TriangleAlert size={16} />
              <span>{error}</span>
            </div>
          )}
          <div className="page" key={page}>
            {page === 'overview' && (
              <OverviewPage
                demo={demo}
                online={online}
                capture={capture}
                device={device}
                sessions={sessions}
                report={report}
                labelLevels={labelLevels}
                scenario={scenario}
                onScenarioChange={(value) => {
                  setScenario(value);
                  setCapture(null);
                }}
                channel={channel}
                onChannelChange={setChannel}
                demoRun={{ running, progress, onToggle: toggleDemoCapture }}
                live={{
                  importing,
                  processing,
                  connection,
                  onImport: () => fileRef.current.click(),
                }}
                onSelect={selectCapture}
                onNavigate={setPage}
              />
            )}
            {page === 'sessions' && (
              <SessionsPage
                demo={demo}
                sessions={sessions}
                filter={filter}
                onFilterChange={setFilter}
                onExport={exportSession}
                onClearDemo={() => {
                  setSessions([]);
                  setCapture(null);
                  setToast('Demo session cleared');
                }}
                onSelect={selectCapture}
                onNavigate={setPage}
              />
            )}
            {page === 'model' && <ModelPage report={report} />}
          </div>
          <footer>
            <span>
              <FlaskConical size={13} />
              Research only. Not for diagnosis or treatment.
            </span>
            <span>VitalView v2 · ESP32 → Node → MLP → React</span>
          </footer>
        </div>
      </main>
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={importCsv} />
      {settingsOpen && (
        <SettingsDialog
          api={api}
          token={token}
          onSave={(nextApi, nextToken) => {
            setApi(nextApi);
            setToken(nextToken);
            switchMode('live');
            setSettingsOpen(false);
            setToast('Connection settings applied');
          }}
          onInvalid={() => setToast('Enter a valid http:// or https:// backend address.')}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {selected && <CaptureDialog capture={selected} onClose={() => setSelected(null)} />}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-icon">
            <Check size={14} strokeWidth={3} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}
