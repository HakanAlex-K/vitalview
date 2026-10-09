import React, { useId, useMemo, useState } from 'react';
import { AudioLines } from 'lucide-react';
import { formatInteger } from '../lib/format.js';
import { normalize } from '../lib/signal.js';

const WIDTH = 1000;
const HEIGHT = 200;
const PAD = 10; // Vertical breathing room inside each lane, in viewBox units.
const NAMES = { ir: 'IR', red: 'Red' };
const TICKS = [0, 75, 150, 225, 299];

/**
 * One lane per channel, each normalized independently, so the red trace is no longer hidden
 * behind the infrared one. Hovering reads out the raw ADC values at that sample.
 */
export function SignalPlot({ samples = [], channel = 'both', compact = false }) {
  const id = useId();
  const [hover, setHover] = useState(null);
  const keys = channel === 'both' ? ['ir', 'red'] : [channel];
  const laneHeight = HEIGHT / keys.length;
  const count = samples.length;

  const lanes = useMemo(
    () =>
      count > 1
        ? keys.map((key, lane) => {
            const top = lane * laneHeight;
            const ys = normalize(samples.map((r) => r[key])).map(
              (v) => top + PAD + (1 - v) * (laneHeight - 2 * PAD),
            );
            const step = WIDTH / (count - 1);
            const line = ys.map(
              (y, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)},${y.toFixed(1)}`,
            );
            const bottom = top + laneHeight;
            return {
              key,
              top,
              ys,
              line: line.join(''),
              area: `${line.join('')}L${WIDTH},${bottom}L0,${bottom}Z`,
            };
          })
        : [],
    [samples, channel],
  );

  function track(e) {
    if (count < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(fraction * (count - 1)));
  }

  const left = hover == null ? 0 : (hover / (count - 1)) * 100;

  return (
    <div className={'plot-wrap' + (compact ? ' compact' : '')}>
      <div
        className="plot"
        onPointerMove={track}
        onPointerDown={track}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={
            count
              ? 'Optical signal, each channel independently normalized for visualization'
              : 'No optical samples available'
          }
        >
          <defs>
            {keys.map((key) => (
              <linearGradient key={key} id={id + key} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: `var(--${key})`, stopOpacity: 0.22 }} />
                <stop offset="1" style={{ stopColor: `var(--${key})`, stopOpacity: 0 }} />
              </linearGradient>
            ))}
          </defs>
          {[0.25, 0.5, 0.75].map((x) => (
            <line key={x} className="grid-line" x1={x * WIDTH} x2={x * WIDTH} y1="0" y2={HEIGHT} />
          ))}
          {keys.length > 1 && (
            <line className="lane-divider" x1="0" x2={WIDTH} y1={laneHeight} y2={laneHeight} />
          )}
          {lanes.map((lane) => (
            <g key={lane.key}>
              <path d={lane.area} fill={`url(#${id + lane.key})`} />
              <path className={'trace ' + lane.key} d={lane.line} />
            </g>
          ))}
        </svg>
        {lanes.map((lane) => (
          <span
            key={lane.key}
            className={'lane-label ' + lane.key}
            style={{ top: `calc(${(lane.top / HEIGHT) * 100}% + 8px)` }}
          >
            {NAMES[lane.key]}
          </span>
        ))}
        {hover != null && lanes.length > 0 && (
          <>
            <span className="cursor" style={{ left: left + '%' }} />
            {lanes.map((lane) => (
              <span
                key={lane.key}
                className={'cursor-dot ' + lane.key}
                style={{ left: left + '%', top: (lane.ys[hover] / HEIGHT) * 100 + '%' }}
              />
            ))}
            <div
              className="plot-tooltip"
              style={{ left: Math.min(84, Math.max(16, left)) + '%' }}
              aria-hidden="true"
            >
              <strong>Sample {hover}</strong>
              {keys.map((key) => (
                <span key={key}>
                  <i className={key} />
                  {NAMES[key]} <b>{formatInteger(samples[hover][key])}</b>
                </span>
              ))}
            </div>
          </>
        )}
        {!count && (
          <div className="plot-empty">
            <AudioLines size={22} />
            Waiting for a capture
          </div>
        )}
      </div>
      {!compact && (
        <div className="axis" aria-hidden="true">
          {TICKS.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
