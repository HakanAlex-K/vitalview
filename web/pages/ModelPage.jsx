import React from 'react';
import { Activity, Cpu, Download, Layers, Radio, ShieldCheck, Trophy } from 'lucide-react';
import { Badge } from '../components/Badge.jsx';
import { download } from '../lib/download.js';

const EVIDENCE = [
  [
    'Verified in code',
    'Shared training/inference features and scalers. Overlap-purged evaluation. Reproducible model artifacts.',
  ],
  [
    'Experiment confirmed',
    'Petri dishes containing different glucose concentrations, with xanthan gum added to approximate blood viscosity. These were solution experiments, not human measurements.',
  ],
  [
    'Still unverified',
    'Concentration units, xanthan-gum quantities, independent dish preparations, and performance on new experiments remain unverified.',
  ],
  [
    'Before clinical use',
    'This is an educational prototype. Do not use the estimates for diagnosis, medication, or treatment decisions.',
  ],
];

function Architecture({ report }) {
  const steps = [
    [Cpu, '01', 'Acquire', 'Dual MAX30105 + ESP32'],
    [Radio, '02', 'Transport', '300 IR/red sample pairs'],
    [Layers, '03', 'Infer', report.architecture.join(' → ') + ' MLP'],
    [Activity, '04', 'Inspect', 'Quality + experimental output'],
  ];
  return (
    <div className="architecture">
      {steps.map(([Icon, number, title, detail]) => (
        <div key={number}>
          <span className="architecture-icon">
            <Icon size={18} />
          </span>
          <span className="tiny-label">{number}</span>
          <strong>{title}</strong>
          <small>{detail}</small>
        </div>
      ))}
    </div>
  );
}

function BenchmarkComparison({ report }) {
  const { evaluation } = report;
  const models = [
    ['Neural network', evaluation.neural_network.mae],
    ['Linear ridge baseline', evaluation.ridge.mae],
    ['Training-median baseline', evaluation.training_median.mae],
  ];
  const largest = Math.max(1, ...Object.values(evaluation).map((v) => v.mae));

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Compared on the same holdout</h2>
          <p>Mean absolute error · lower is better</p>
        </div>
      </div>
      <div className="benchmark-bars">
        {models.map(([label, mae], i) => (
          <div key={label}>
            <div>
              <span>{label}</span>
              <strong>{mae.toFixed(2)}</strong>
            </div>
            <div className="bar-track">
              <span
                className={i === 0 ? 'best' : ''}
                style={{ width: (mae / largest) * 100 + '%' }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="panel-note">
        This is a within-recording holdout, not an independent-person or independent-session test.
        The original Keras model from the competition version has not been benchmarked under this
        split, so no improvement over it is claimed.
      </p>
      <button
        className="secondary"
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

export function ModelPage({ report }) {
  if (!report) {
    return (
      <section className="panel">
        <h2>Model evidence unavailable</h2>
        <p>
          Connect to the backend to load its current evaluation report. The demo includes a bundled
          report.
        </p>
      </section>
    );
  }

  const headlineMetrics = [
    [report.evaluation.neural_network.mae.toFixed(2), 'Neural-network MAE', 'Dataset-label units'],
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
      <div className="model-intro panel">
        <div>
          <Badge tone="orange">
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
      </div>
      <div className="section-label">
        <span>REPRODUCIBLE BENCHMARK</span>
        <Badge>
          Fixed seed {report.seed} · {report.epochs} epochs
        </Badge>
      </div>
      <div className="metrics model-metrics">
        {headlineMetrics.map(([value, title, detail]) => (
          <section className="metric" key={title}>
            <div className="metric-top">{title}</div>
            <div className="metric-value">{value}</div>
            <div className="muted small">{detail}</div>
          </section>
        ))}
      </div>
      <div className="bottom-grid">
        <BenchmarkComparison report={report} />
        <section className="panel evidence">
          <div className="panel-heading">
            <div>
              <h2>What the evidence supports</h2>
              <p>Keep the claims as precise as the code.</p>
            </div>
            <ShieldCheck size={20} />
          </div>
          {EVIDENCE.map(([title, detail]) => (
            <div className="evidence-item" key={title}>
              <span className="tiny-label">{title}</span>
              <p>{detail}</p>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
