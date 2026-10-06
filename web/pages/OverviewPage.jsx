import React from 'react';
import {
  Activity,
  ArrowUpRight,
  AudioLines,
  ChevronRight,
  Cpu,
  FlaskConical,
  Heart,
  History,
  LoaderCircle,
  Pause,
  Play,
  Upload,
} from 'lucide-react';
import { Badge, StatusBadge } from '../components/Badge.jsx';
import { ChipIllustration } from '../components/ChipIllustration.jsx';
import { SignalPlot } from '../components/SignalPlot.jsx';
import { DEMO_ESTIMATE, DEMO_HEART_RATE, DEMO_OXYGEN, syntheticWave } from '../lib/demo.js';
import { formatTime, formatValue, statusLabel } from '../lib/format.js';

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

function MetricCards({ demo, values, device }) {
  const cards = [
    {
      title: 'Heart rate',
      value: values.heartRate,
      unit: 'bpm',
      Icon: Heart,
      color: 'coral',
      sub: demo ? 'Illustrative pulse reading' : 'Reported by device · not calculated here',
    },
    {
      title: 'Oxygen saturation',
      value: values.oxygen,
      unit: '% SpO₂',
      Icon: Activity,
      color: 'teal',
      sub: demo
        ? 'Illustrative oxygen reading'
        : device?.oxygenExperimental
          ? 'Experimental device formula · uncalibrated'
          : 'Reported by device · not calculated here',
    },
    {
      title: 'Solution concentration',
      value: values.estimate,
      unit: 'label units',
      Icon: FlaskConical,
      color: 'orange',
      sub: demo
        ? 'Illustrative value · not model output'
        : 'Petri-dish model · concentration units unconfirmed',
    },
  ];

  return (
    <div className="metrics">
      {cards.map(({ title, value, unit, Icon, color, sub }) => (
        <section className={'metric ' + color} key={title}>
          <div className="metric-top">
            <span>{title}</span>
            <span className="metric-icon">
              <Icon size={18} />
            </span>
          </div>
          <div className="metric-value">
            {formatValue(value)}
            <span>{unit}</span>
          </div>
          <div className="metric-bottom">
            <span className="small-dot" />
            {value == null ? 'No usable reading' : sub}
          </div>
        </section>
      ))}
    </div>
  );
}

function SignalPanel({ demo, values, capture, channel, onChannelChange }) {
  const reason = values.fresh && (capture.reason || capture.quality?.reasons?.join(' · '));

  return (
    <section className="panel signal-panel">
      <div className="panel-heading">
        <div>
          <h2>
            Inside the signal <Badge tone="green">{values.samples.length || 0} samples</Badge>
          </h2>
          <p>Infrared and red light · optical waveform</p>
        </div>
        <AudioLines size={21} className="muted" />
      </div>
      <div className="signal-controls">
        <div className="legend">
          <span>
            <i className="green" />
            Infrared
          </span>
          <span>
            <i className="orange" />
            Red
          </span>
        </div>
        <div className="segmented">
          {CHANNELS.map(([value, label]) => (
            <button
              className={channel === value ? 'chosen' : ''}
              key={value}
              onClick={() => onChannelChange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <SignalPlot samples={values.samples} channel={channel} />
      <div className="axis">
        <span>Sample 0</span>
        <span>75</span>
        <span>150</span>
        <span>225</span>
        <span>299</span>
      </div>
      <div className="signal-footer">
        <span>
          <span className="small-dot" />{' '}
          {demo
            ? 'Synthetic signal'
            : capture?.source === 'import'
              ? 'Imported capture'
              : 'Received optical signal'}
        </span>
        <span>Channels normalized independently · not time-scaled</span>
      </div>
      <div className="quality-row">
        <div>
          <span className="tiny-label">CAPTURE STATUS</span>
          <strong>{values.status}</strong>
        </div>
        <div>
          <span className="tiny-label">SIGNAL QUALITY</span>
          <strong>{values.quality}</strong>
        </div>
        <div>
          <span className="tiny-label">LAST CAPTURE</span>
          <strong>{capture ? formatTime(capture.receivedAt) : 'Not captured'}</strong>
        </div>
      </div>
      {reason && <div className="inline-error">{reason}</div>}
    </section>
  );
}

function CapturePanel({ demo, online, scenario, onScenarioChange, demoRun, live }) {
  return (
    <section className="panel capture-panel">
      <div className="panel-heading">
        <div>
          <h2>Capture studio</h2>
          <p>One window. Two optical channels.</p>
        </div>
        <span className="outline-icon">
          <Cpu size={18} />
        </span>
      </div>
      <div className="chip-visual">
        <ChipIllustration />
      </div>
      <div className="hardware-caption">
        <span>MAX30105 × 2</span>
        <span className="trace" />
        <span>ESP32</span>
        <span className="trace" />
        <span>MODEL</span>
      </div>
      {demo ? (
        <>
          <label className="select-label" htmlFor="scenario">
            Signal scenario
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
          <button className="primary wide" onClick={demoRun.onToggle}>
            {demoRun.running ? <Pause size={16} /> : <Play size={16} />}{' '}
            {demoRun.running ? 'Pause demo' : 'Run a capture demo'}
            <span>{demoRun.running ? `${demoRun.progress}%` : '10 sec'}</span>
          </button>
          <div className="progress">
            <span style={{ width: demoRun.progress + '%' }} />
          </div>
          <p className="microcopy">
            Illustrates acquisition and rejection. No medical interpretation.
          </p>
        </>
      ) : (
        <>
          <button
            className="primary wide"
            disabled={live.importing || live.processing || !online}
            onClick={live.onImport}
          >
            {live.importing ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />}
            Import optical CSV
          </button>
          <p className="microcopy">
            300 rows, two columns: ir, red. Device uploads also arrive automatically.
          </p>
          <Badge tone={online ? 'green' : ''}>
            {live.processing
              ? 'Processing capture'
              : online
                ? 'Backend ready'
                : 'Start npm start to connect'}
          </Badge>
          <p className="microcopy">
            {live.connection?.configured
              ? live.connection.connected
                ? 'ESP32 /data connected'
                : live.connection.error || 'Checking ESP32 /data'
              : 'Heart rate / SpO₂: configure ESP32_URL or push to /api/vitals. Optical captures arrive separately via /glucose.'}
          </p>
        </>
      )}
    </section>
  );
}

function sourceLabel(source) {
  if (source === 'synthetic') return 'Demo capture';
  if (source === 'import') return 'CSV capture';
  return 'Device capture';
}

function RecentCaptures({ demo, sessions, onSelect, onNavigate }) {
  return (
    <section className="panel recent-panel">
      <div className="panel-heading">
        <div>
          <h2>Recent captures</h2>
          <p>Only this browser’s demo or local server’s current session</p>
        </div>
        <button className="text-button" onClick={() => onNavigate('sessions')}>
          View all <ArrowUpRight size={14} />
        </button>
      </div>
      {sessions.length ? (
        <div className="recent-list">
          {sessions.slice(0, 3).map((r) => (
            <button key={r.id} className="capture-row" onClick={() => onSelect(r)}>
              <span className={'row-icon ' + (r.status === 'estimated' ? '' : 'rejected')}>
                <AudioLines size={17} />
              </span>
              <span>
                <strong>{sourceLabel(r.source)}</strong>
                <small>{formatTime(r.receivedAt)} · 300 sample pairs</small>
              </span>
              <StatusBadge status={r.status}>
                {r.status === 'estimated' ? 'Accepted' : 'Rejected'}
              </StatusBadge>
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-inline">
          <span>
            <History size={22} />
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

export function OverviewPage({
  demo,
  online,
  capture,
  device,
  sessions,
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
      <div className="section-label">
        <span>LIVE OBSERVATIONS</span>
        <span className="source-label">
          <i className={demo ? 'orange' : online ? 'green' : 'gray'} />
          {demo ? 'Synthetic preview' : online ? 'Device / imported signal' : 'Not connected'}
        </span>
      </div>
      <MetricCards demo={demo} values={values} device={device} />
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
          scenario={scenario}
          onScenarioChange={onScenarioChange}
          demoRun={demoRun}
          live={live}
        />
      </div>
      <div className="bottom-grid">
        <RecentCaptures
          demo={demo}
          sessions={sessions}
          onSelect={onSelect}
          onNavigate={onNavigate}
        />
        <section className="pipeline-card">
          <span className="eyebrow">THE ENGINEERING STORY</span>
          <h2>
            Small board.
            <br />
            Connected system.
          </h2>
          <p>Optical acquisition → API → neural network → a readable research interface.</p>
          <button className="text-button" onClick={() => onNavigate('model')}>
            See how it works <ArrowUpRight size={16} />
          </button>
        </section>
      </div>
    </>
  );
}
