import React from 'react';
import {
  ArrowUpRight,
  AudioLines,
  BrainCircuit,
  ChevronRight,
  Cpu,
  Droplets,
  FlaskConical,
  Heart,
  History,
  LoaderCircle,
  Pause,
  Play,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
  Upload,
} from 'lucide-react';
import { Badge, StatusBadge } from '../components/Badge.jsx';
import { ChannelStats } from '../components/ChannelStats.jsx';
import { Segmented } from '../components/Segmented.jsx';
import { SignalPlot } from '../components/SignalPlot.jsx';
import { DEMO_ESTIMATE, DEMO_HEART_RATE, DEMO_OXYGEN, syntheticWave } from '../lib/demo.js';
import { formatTime, formatValue, sourceLabel, statusLabel } from '../lib/format.js';

const CHANNELS = [
  ['both', 'Both'],
  ['ir', 'IR'],
  ['red', 'Red'],
];

/**
 * Derive what the overview may display. Device mode shows only fresh values that the backend
 * actually received; it never substitutes demo numbers for missing readings.
 */
function readings({ demo, lowSignal, running, capture, device, online }) {
  const fresh = Boolean(capture && !capture.stale);
  const deviceUsable = device && !device.stale && online;

  if (demo) {
    return {
      fresh,
      samples: capture?.samples || syntheticWave(lowSignal),
      heartRate: lowSignal ? null : DEMO_HEART_RATE,
      oxygen: lowSignal ? null : DEMO_OXYGEN,
      estimate: lowSignal ? null : (capture?.estimate ?? DEMO_ESTIMATE),
      status: running
        ? 'Acquiring signal'
        : capture
          ? capture.status === 'estimated'
            ? 'Capture complete'
            : 'Capture rejected'
          : 'Ready to explore',
      quality: lowSignal ? 'Low signal' : 'Demo: accepted',
    };
  }

  return {
    fresh,
    samples: online && fresh ? capture.samples || [] : [],
    heartRate: deviceUsable ? device.heartRate : null,
    oxygen: deviceUsable ? device.oxygen : null,
    estimate: fresh && online && capture.status === 'estimated' ? capture.estimate : null,
    status: !online
      ? 'Backend offline'
      : capture?.stale
        ? 'Capture expired'
        : capture
          ? statusLabel(capture.status)
          : 'Awaiting device',
    quality: fresh ? (capture.quality?.accepted ? 'Checks passed' : 'Rejected') : '—',
  };
}

// One heartbeat, 100 viewBox units wide. The strip holds 8 beats and scrolls by half its width.
const BEAT = 'h18 l5 -5 l5 5 h6 l4 6 l6 -30 l6 30 l4 -6 h8 l7 -7 l7 7 h24';

/** A scrolling heartbeat trace that moves at the reported rate; flat when there is none. */
function PulseTrace({ bpm }) {
  return (
    <div className={'pulse-trace' + (bpm ? '' : ' flat')} aria-hidden="true">
      <svg
        viewBox="0 0 800 48"
        preserveAspectRatio="none"
        style={bpm ? { animationDuration: `${(4 * 60) / bpm}s` } : undefined}
      >
        <path
          d={bpm ? `M0 34 ${Array(8).fill(BEAT).join(' ')}` : 'M0 34 H800'}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/** Position a value on a linear scale, with optional marks (e.g. the trained label levels). */
function ScaleBar({ value, min, max, marks = [], labels }) {
  const place = (v) => ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100;
  return (
    <div className="scale" aria-hidden="true">
      <div className="scale-track">
        {value != null && <span className="scale-fill" style={{ width: place(value) + '%' }} />}
        {marks.map((m) => (
          <i key={m} className="scale-mark" style={{ left: place(m) + '%' }} />
        ))}
        {value != null && <span className="scale-marker" style={{ left: place(value) + '%' }} />}
      </div>
      <div className="scale-labels">
        {labels.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function MetricCards({ demo, values, device, labelLevels }) {
  const top = Math.max(...labelLevels);
  const cards = [
    {
      title: 'Heart rate',
      value: values.heartRate,
      unit: 'bpm',
      Icon: Heart,
      tone: 'rose',
      sub: demo ? 'Illustrative pulse reading' : 'Reported by device · not calculated here',
      visual: <PulseTrace bpm={values.heartRate} />,
    },
    {
      title: 'Oxygen saturation',
      value: values.oxygen,
      unit: '% SpO₂',
      Icon: Droplets,
      tone: 'blue',
      sub: demo
        ? 'Illustrative oxygen reading'
        : device?.oxygenExperimental
          ? 'Experimental device formula · uncalibrated'
          : 'Reported by device · not calculated here',
      visual: <ScaleBar value={values.oxygen} min={80} max={100} labels={['80', '90', '100%']} />,
    },
    {
      title: 'Solution concentration',
      value: values.estimate,
      unit: 'label units',
      Icon: FlaskConical,
      tone: 'orange',
      sub: demo
        ? 'Illustrative value · not model output'
        : 'Petri-dish model · concentration units unconfirmed',
      visual: (
        <ScaleBar
          value={values.estimate}
          min={0}
          max={top}
          marks={labelLevels}
          labels={['0', 'Trained levels', String(top)]}
        />
      ),
    },
  ];

  return (
    <div className="metrics">
      {cards.map(({ title, value, unit, Icon, tone, sub, visual }) => (
        <section className={'metric ' + tone} key={title}>
          <div className="metric-top">
            <span className="metric-icon">
              <Icon size={16} />
            </span>
            <span className="metric-title">{title}</span>
            <span className={'metric-tag' + (value == null ? ' none' : '')}>
              {demo ? 'Synthetic' : value == null ? 'No data' : 'Fresh'}
            </span>
          </div>
          <div className="metric-value">
            {formatValue(value)}
            <span>{unit}</span>
          </div>
          {visual}
          <div className="metric-sub">{value == null ? 'No usable reading' : sub}</div>
        </section>
      ))}
    </div>
  );
}

function SignalPanel({ demo, values, capture, channel, onChannelChange }) {
  const reason = values.fresh && (capture.reason || capture.quality?.reasons?.join(' · '));
  const source = demo
    ? 'Synthetic signal'
    : capture?.source === 'import'
      ? 'Imported capture'
      : capture
        ? 'Received optical signal'
        : '—';

  return (
    <section className="panel signal-panel">
      <div className="panel-head">
        <div>
          <h2>
            Optical waveform <Badge>{values.samples.length || 0} samples</Badge>
          </h2>
          <p>Infrared and red light · channels normalized independently · not time-scaled</p>
        </div>
        <Segmented options={CHANNELS} value={channel} onChange={onChannelChange} label="Channel" />
      </div>
      <SignalPlot samples={values.samples} channel={channel} />
      {values.samples.length > 0 && <ChannelStats samples={values.samples} channel={channel} />}
      <dl className="quality-row">
        <div>
          <dt>Capture status</dt>
          <dd>{values.status}</dd>
        </div>
        <div>
          <dt>Signal quality</dt>
          <dd>{values.quality}</dd>
        </div>
        <div>
          <dt>Last capture</dt>
          <dd>{capture ? formatTime(capture.receivedAt) : 'Not captured'}</dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{source}</dd>
        </div>
      </dl>
      {reason && (
        <div className="inline-error">
          <TriangleAlert size={15} />
          <span>{reason}</span>
        </div>
      )}
    </section>
  );
}

/** What each stage of the acquisition pipeline is doing, from the data the UI actually has. */
function pipelineStages({ demo, online, capture, demoRun, live, architecture }) {
  const fresh = Boolean(capture && !capture.stale);
  const status = fresh ? capture.status : null;
  const stages = [
    { Icon: ScanLine, name: 'Optical sensors', detail: '2 × MAX30105 · IR + red' },
    { Icon: Cpu, name: 'ESP32', detail: 'Buffers a 300-sample window' },
    { Icon: ShieldCheck, name: 'API & quality gates', detail: 'Range, flatness, saturation' },
    { Icon: BrainCircuit, name: 'Neural network', detail: architecture },
  ];
  let states;

  if (demo) {
    const active = Math.min(3, Math.floor(demoRun.progress / 25));
    states = demoRun.running
      ? stages.map((_, i) =>
          i < active ? ['done', 'Done'] : i === active ? ['active', 'Running'] : ['idle', 'Queued'],
        )
      : status === 'estimated'
        ? [
            ['done', 'Captured'],
            ['done', 'Sent'],
            ['done', 'Passed'],
            ['done', 'Estimated'],
          ]
        : status
          ? [
              ['done', 'Captured'],
              ['done', 'Sent'],
              ['warn', 'Rejected'],
              ['idle', 'Skipped'],
            ]
          : stages.map(() => ['idle', 'Ready']);
  } else {
    const model = live.processing
      ? ['active', 'Running']
      : status === 'estimated'
        ? ['done', 'Estimated']
        : status === 'error' || status === 'invalid'
          ? ['err', 'Unavailable']
          : status && status !== 'rejected'
            ? ['warn', statusLabel(status)]
            : ['idle', 'Waiting'];
    states = [
      fresh ? ['done', 'Received'] : ['idle', 'Waiting'],
      live.connection?.configured
        ? live.connection.connected
          ? ['done', 'Connected']
          : ['warn', 'Unreachable']
        : ['idle', 'Not polled'],
      !online
        ? ['err', 'Offline']
        : status === 'rejected'
          ? ['warn', 'Rejected']
          : ['done', 'Online'],
      model,
    ];
  }

  return stages.map((stage, i) => ({ ...stage, state: states[i][0], label: states[i][1] }));
}

function CapturePanel({
  demo,
  online,
  capture,
  scenario,
  onScenarioChange,
  demoRun,
  live,
  report,
}) {
  const architecture = (report?.architecture ?? [23, 64, 32, 1]).join(' → ') + ' MLP';
  const stages = pipelineStages({ demo, online, capture, demoRun, live, architecture });

  return (
    <section className="panel capture-panel">
      <div className="panel-head">
        <div>
          <h2>Capture studio</h2>
          <p>One 300-sample window, two optical channels.</p>
        </div>
      </div>
      <ol className="pipeline">
        {stages.map(({ Icon, name, detail, state, label }) => (
          <li className={'stage ' + state} key={name}>
            <span className="stage-icon">
              {state === 'active' ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Icon size={16} />
              )}
            </span>
            <span className="stage-text">
              <strong>{name}</strong>
              <small>{detail}</small>
            </span>
            <span className="stage-state">{label}</span>
          </li>
        ))}
      </ol>
      <div className="capture-controls">
        {demo ? (
          <>
            <label className="field" htmlFor="scenario">
              <span>Signal scenario</span>
            </label>
            <select
              id="scenario"
              value={scenario}
              disabled={demoRun.running}
              onChange={(e) => onScenarioChange(e.target.value)}
            >
              <option value="steady">Steady optical signal</option>
              <option value="poor">Low optical signal</option>
            </select>
            <button className="btn primary wide" onClick={demoRun.onToggle}>
              {demoRun.running ? <Pause size={16} /> : <Play size={16} />}
              {demoRun.running ? 'Pause demo' : 'Run a capture demo'}
              <span className="btn-meta">
                {demoRun.running ? `${demoRun.progress}%` : '10 sec'}
              </span>
            </button>
            <div className="progress" aria-hidden="true">
              <span style={{ width: demoRun.progress + '%' }} />
            </div>
            <p className="microcopy">
              Illustrates acquisition and rejection. No medical interpretation.
            </p>
          </>
        ) : (
          <>
            <button
              className="btn primary wide"
              disabled={live.importing || live.processing || !online}
              onClick={live.onImport}
            >
              {live.importing ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}
              Import optical CSV
            </button>
            <p className="microcopy">
              300 rows, two columns: ir, red. Device uploads also arrive automatically.
            </p>
            <p className="microcopy boxed">
              {live.connection?.configured
                ? live.connection.connected
                  ? 'ESP32 /data connected'
                  : live.connection.error || 'Checking ESP32 /data'
                : 'Heart rate / SpO₂: configure ESP32_URL or push to /api/vitals. Optical captures arrive separately via /glucose.'}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function RecentCaptures({ demo, sessions, onSelect, onNavigate }) {
  return (
    <section className="panel recent-panel">
      <div className="panel-head">
        <div>
          <h2>Recent captures</h2>
          <p>Only this browser’s demo or local server’s current session</p>
        </div>
        <button className="link-button" onClick={() => onNavigate('sessions')}>
          View all <ArrowUpRight size={14} />
        </button>
      </div>
      {sessions.length ? (
        <div className="recent-list">
          {sessions.slice(0, 4).map((r) => (
            <button key={r.id} className="capture-row" onClick={() => onSelect(r)}>
              <span className={'row-icon ' + (r.status === 'estimated' ? 'ok' : 'warn')}>
                <AudioLines size={16} />
              </span>
              <span className="row-main">
                <strong>{sourceLabel(r.source)}</strong>
                <small>{formatTime(r.receivedAt)} · 300 sample pairs</small>
              </span>
              <span className="row-value">
                {formatValue(r.estimate)}
                {r.estimate != null && <small>label units</small>}
              </span>
              <StatusBadge status={r.status}>
                {r.status === 'estimated' ? 'Accepted' : 'Rejected'}
              </StatusBadge>
              <ChevronRight size={16} className="row-chevron" />
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-inline">
          <span>
            <History size={20} />
          </span>
          <div>
            <strong>Your first capture starts here.</strong>
            <p>
              {demo
                ? 'Run a demo to see the signal-to-result workflow.'
                : 'Connect your device or import an optical CSV.'}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function SessionSummary({ demo, sessions, onNavigate }) {
  const accepted = sessions.filter((r) => r.status === 'estimated').length;
  const rejected = sessions.length - accepted;
  return (
    <section className="panel summary-panel">
      <div className="panel-head">
        <div>
          <h2>This session</h2>
          <p>{demo ? 'Kept in this browser tab only' : 'Held in memory by the local server'}</p>
        </div>
      </div>
      <div className="summary-stats">
        <div>
          <span>Captures</span>
          <strong>{sessions.length}</strong>
        </div>
        <div className="ok">
          <span>Accepted</span>
          <strong>{accepted}</strong>
        </div>
        <div className="warn">
          <span>Rejected</span>
          <strong>{rejected}</strong>
        </div>
      </div>
      <div className="split-bar" aria-hidden="true">
        {sessions.length ? (
          <>
            <span className="ok" style={{ flexGrow: accepted }} />
            <span className="warn" style={{ flexGrow: rejected }} />
          </>
        ) : (
          <span className="none" />
        )}
      </div>
      <button className="story-link" onClick={() => onNavigate('model')}>
        <span>
          <strong>How the model was evaluated</strong>
          <small>Purged split, baselines, and limits</small>
        </span>
        <ArrowUpRight size={16} />
      </button>
    </section>
  );
}

export function OverviewPage({
  demo,
  online,
  capture,
  device,
  sessions,
  report,
  labelLevels,
  scenario,
  onScenarioChange,
  channel,
  onChannelChange,
  demoRun,
  live,
  onSelect,
  onNavigate,
}) {
  const values = readings({
    demo,
    lowSignal: scenario === 'poor',
    running: demoRun.running,
    capture,
    device,
    online,
  });

  return (
    <>
      <MetricCards demo={demo} values={values} device={device} labelLevels={labelLevels} />
      <div className="overview-grid">
        <SignalPanel
          demo={demo}
          values={values}
          capture={capture}
          channel={channel}
          onChannelChange={onChannelChange}
        />
        <CapturePanel
          demo={demo}
          online={online}
          capture={capture}
          scenario={scenario}
          onScenarioChange={onScenarioChange}
          demoRun={demoRun}
          live={live}
          report={report}
        />
      </div>
      <div className="overview-grid">
        <RecentCaptures
          demo={demo}
          sessions={sessions}
          onSelect={onSelect}
          onNavigate={onNavigate}
        />
        <SessionSummary demo={demo} sessions={sessions} onNavigate={onNavigate} />
      </div>
    </>
  );
}
