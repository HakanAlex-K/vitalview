import React from 'react';
import {
  Activity,
  ChevronRight,
  CircleCheck,
  Cpu,
  Download,
  FlaskConical,
  Layers,
  OctagonAlert,
  Radio,
  ShieldAlert,
  Trophy,
} from 'lucide-react';
import { Badge } from '../components/Badge.jsx';
import { download } from '../lib/download.js';

const EVIDENCE = [
  {
    title: 'Verified in code',
    tone: 'ok',
    Icon: CircleCheck,
    detail:
      'Shared training/inference features and scalers. Overlap-purged evaluation. Reproducible model artifacts.',
  },
  {
    title: 'Experiment confirmed',
    tone: 'info',
    Icon: FlaskConical,
    detail:
      'Petri dishes containing different glucose concentrations, with xanthan gum added to approximate blood viscosity. These were solution experiments, not human measurements.',
  },
  {
    title: 'Still unverified',
    tone: 'warn',
    Icon: OctagonAlert,
    detail:
      'Concentration units, xanthan-gum quantities, independent dish preparations, and performance on new experiments remain unverified.',
  },
  {
    title: 'Before clinical use',
    tone: 'err',
    Icon: ShieldAlert,
    detail:
      'This is an educational prototype. Do not use the estimates for diagnosis, medication, or treatment decisions.',
  },
];

function Architecture({ report }) {
  const steps = [
    [Cpu, 'Acquire', 'Dual MAX30105 + ESP32'],
    [Radio, 'Transport', '300 IR/red sample pairs'],
    [Layers, 'Infer', report.architecture.join(' → ') + ' MLP'],
    [Activity, 'Inspect', 'Quality + experimental output'],
  ];
  return (
    <ol className="architecture">
      {steps.map(([Icon, title, detail], i) => (
        <li key={title}>
          <span className="architecture-icon">
            <Icon size={17} />
          </span>
          <span className="architecture-step">0{i + 1}</span>
          <strong>{title}</strong>
          <small>{detail}</small>
          {i < steps.length - 1 && <ChevronRight size={16} className="architecture-arrow" />}
        </li>
      ))}
    </ol>
  );
}

function BenchmarkComparison({ report }) {
  const { evaluation } = report;
  const models = [
    ['Neural network', evaluation.neural_network],
    ['Linear ridge baseline', evaluation.ridge],
    ['Training-median baseline', evaluation.training_median],
  ];
  const largest = Math.max(1, ...Object.values(evaluation).map((v) => v.mae));

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Compared on the same holdout</h2>
          <p>Mean absolute error · lower is better</p>
        </div>
      </div>
      <div className="benchmark-bars">
        {models.map(([label, metrics], i) => (
          <div key={label} className={i === 0 ? 'best' : ''}>
            <div className="benchmark-label">
              <span>{label}</span>
              <strong>{metrics.mae.toFixed(2)}</strong>
            </div>
            <div className="bar-track">
              <span style={{ width: Math.max(1.5, (metrics.mae / largest) * 100) + '%' }} />
            </div>
            {metrics.rmse != null && (
              <small>
                RMSE {metrics.rmse.toFixed(2)}
                {metrics.r2 != null && ` · R² ${metrics.r2.toFixed(3)}`}
              </small>
            )}
          </div>
        ))}
      </div>
      <p className="panel-note">
        This is a within-recording holdout, not an independent-person or independent-session test.
        The original Keras model from the competition version has not been benchmarked under this
        split, so no improvement over it is claimed.
      </p>
      <button
        className="btn secondary"
        onClick={() =>
          download('vitalview-benchmark.json', JSON.stringify(report, null, 2), 'application/json')
        }
      >
        <Download size={15} />
        Download benchmark
      </button>
    </section>
  );
}

/** Each recording split into train, purged gap and test windows, drawn to scale. */
function PurgedSplit({ report }) {
  const runs = report.runs ?? [];
  if (!runs.length) return null;
  const longest = Math.max(...runs.map((r) => r.train + r.purged + r.test));
  return (
    <section className="panel split-panel">
      <div className="panel-head">
        <div>
          <h2>Purged train / test split</h2>
          <p>
            Adjacent windows share 299 of 300 samples, so a random split would leak. Each recording
            is split in time with a 299-window gap.
          </p>
        </div>
      </div>
      <div className="split-legend">
        <span>
          <i className="seg-train" />
          Train · {report.train_rows.toLocaleString()}
        </span>
        <span>
          <i className="seg-purged" />
          Purged gap · {report.purged_rows.toLocaleString()}
        </span>
        <span>
          <i className="seg-test" />
          Test · {report.test_rows.toLocaleString()}
        </span>
      </div>
      <div className="split-rows">
        {runs.map((run) => {
          const total = run.train + run.purged + run.test;
          return (
            <div className="split-row" key={run.start}>
              <span className="split-label">{run.label}</span>
              <div className="split-track">
                <div
                  className="split-bar-run"
                  style={{ width: (total / longest) * 100 + '%' }}
                  title={`Label ${run.label}: ${run.train} train, ${run.purged} purged, ${run.test} test`}
                >
                  <span className="seg-train" style={{ flexGrow: run.train }} />
                  <span className="seg-purged" style={{ flexGrow: run.purged }} />
                  <span className="seg-test" style={{ flexGrow: run.test }} />
                </div>
              </div>
              <span className="split-count">{total.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
      <p className="panel-note">
        Rows are recordings, labelled by concentration level; length is window count. The test
        windows come from the same recordings as training, so this does not show generalization to
        new dishes or sessions.
      </p>
    </section>
  );
}

export function ModelPage({ report }) {
  if (!report) {
    return (
      <section className="panel empty">
        <span className="empty-icon">
          <Layers size={24} />
        </span>
        <h3>Model evidence unavailable</h3>
        <p>
          Connect to the backend to load its current evaluation report. The demo includes a bundled
          report.
        </p>
      </section>
    );
  }

  const nn = report.evaluation.neural_network;
  const ridge = report.evaluation.ridge;
  const headlineMetrics = [
    [nn.mae.toFixed(2), 'Neural-network MAE', 'Dataset-label units'],
    [
      ridge ? (ridge.mae / nn.mae).toFixed(1) + '×' : '—',
      'Lower error than ridge',
      'Same holdout, same features',
    ],
    [
      report.test_rows.toLocaleString(),
      'Held-out windows',
      '299-window gaps between train and test',
    ],
    [
      report.adjacent_overlapping_pairs.toLocaleString(),
      'Overlapping adjacent pairs',
      `Detected in ${report.rows.toLocaleString()} rows`,
    ],
  ];

  return (
    <>
      <section className="panel model-intro">
        <div className="model-intro-text">
          <Badge tone="accent">
            <Trophy size={13} />
            First place · Freshman Design
          </Badge>
          <h2>An end-to-end engineering project.</h2>
          <p>
            Built for Drexel’s Freshman Design program, where it took first place. This edition
            rebuilds the software around consistent preprocessing, inspectable evidence, and an
            honest distinction between a prototype and a validated measurement system.
          </p>
        </div>
        <Architecture report={report} />
      </section>
      <div className="section-label">
        <h2>Reproducible benchmark</h2>
        <Badge>
          Seed {report.seed} · {report.epochs} epochs
          {report.model_id && <code>{report.model_id}</code>}
        </Badge>
      </div>
      <div className="stat-tiles model-metrics">
        {headlineMetrics.map(([value, title, detail], i) => (
          <div className={'stat-tile' + (i < 2 ? ' highlight' : '')} key={title}>
            <span>{title}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      <div className="model-grid">
        <BenchmarkComparison report={report} />
        <PurgedSplit report={report} />
      </div>
      <div className="section-label">
        <h2>What the evidence supports</h2>
        <span className="section-hint">Keep the claims as precise as the code.</span>
      </div>
      <div className="evidence">
        {EVIDENCE.map(({ title, tone, Icon, detail }) => (
          <section className={'evidence-item ' + tone} key={title}>
            <span className="evidence-icon">
              <Icon size={17} />
            </span>
            <div>
              <h3>{title}</h3>
              <p>{detail}</p>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
