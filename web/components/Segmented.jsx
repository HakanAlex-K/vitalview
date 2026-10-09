import React from 'react';

/** A small single-choice button group. `options` is a list of [value, label] pairs. */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([option, text]) => (
        <button
          key={option}
          className={value === option ? 'chosen' : ''}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
