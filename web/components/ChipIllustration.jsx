import React from 'react';

export function ChipIllustration() {
  return (
    <svg
      viewBox="0 0 300 170"
      aria-label="Illustrated signal path from optical sensors to an ESP32 processor"
      role="img"
    >
      <defs>
        <pattern id="dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".8" fill="#dae0da" />
        </pattern>
      </defs>
      <rect width="300" height="170" fill="url(#dots)" />
      {[60, 85, 110].map((y, i) => (
        <path
          key={y}
          d={`M 25 ${y} H ${76 + i * 12} V ${60 + i * 22} H 120 M 180 ${60 + i * 22} H ${220 + i * 12} V ${y} H 285`}
          stroke="#c6d6c7"
          strokeWidth="1.5"
          fill="none"
        />
      ))}
      <rect x="108" y="39" width="88" height="88" rx="16" fill="#e2e9df" />
      {Array.from({ length: 6 }, (_, i) => (
        <g key={i}>
          <path
            d={`M ${123 + i * 11} 31 v 12 M ${123 + i * 11} 123 v 12 M 100 ${54 + i * 11} h 12 M 192 ${54 + i * 11} h 12`}
            stroke="#a3b59e"
            strokeWidth="4"
          />
        </g>
      ))}
      <rect x="117" y="48" width="70" height="70" rx="9" fill="#fff" stroke="#bccab7" />
      <text x="152" y="81" textAnchor="middle" fontSize="11" fontWeight="700" fill="#40513a">
        ESP32
      </text>
      <text x="152" y="96" textAnchor="middle" fontSize="7" fill="#83907d">
        OPTICAL ACQUISITION
      </text>
      <circle cx="34" cy="60" r="5" fill="#ed743b" />
      <circle cx="275" cy="110" r="5" fill="#40927d" />
    </svg>
  );
}
