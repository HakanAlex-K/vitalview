import React from 'react';

/** Scale one channel into the plot's SVG coordinates, independently of the other channel. */
function toPoints(values) {
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  return values
    .map((v, i) => `${(i / (values.length - 1 || 1)) * 900},${112 - ((v - min) / range) * 82}`)
    .join(' ');
}

export function SignalPlot({ samples = [], channel = 'both', small = false }) {
  const ir = samples.map((r) => r.ir);
  const red = samples.map((r) => r.red);
  return (
    <svg
      className={'plot ' + (small ? 'small' : '')}
      viewBox="0 0 900 145"
      preserveAspectRatio="none"
      role="img"
      aria-label={
        samples.length
          ? 'Optical signal, each channel independently normalized for visualization'
          : 'No optical samples available'
      }
    >
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#1e8c79" stopOpacity=".12" />
          <stop offset="1" stopColor="#1e8c79" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[25, 60, 95, 130].map((y) => (
        <line key={y} x1="0" x2="900" y1={y} y2={y} stroke="#edf0ef" />
      ))}
      {[0, 150, 300, 450, 600, 750, 900].map((x) => (
        <line key={x} x1={x} x2={x} y1="10" y2="135" stroke="#f1f3f2" />
      ))}
      {ir.length > 1 && (
        <>
          {channel !== 'red' && (
            <>
              <polygon points={`0,145 ${toPoints(ir)} 900,145`} fill="url(#fade)" />
              <polyline
                points={toPoints(ir)}
                fill="none"
                stroke="#278573"
                strokeWidth="2.4"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
          {channel !== 'ir' && (
            <polyline
              points={toPoints(red)}
              fill="none"
              stroke="#ed824e"
              strokeWidth="1.8"
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </>
      )}
      {!samples.length && (
        <text x="450" y="80" textAnchor="middle" fill="#89938d" fontSize="13">
          Waiting for a capture
        </text>
      )}
    </svg>
  );
}
