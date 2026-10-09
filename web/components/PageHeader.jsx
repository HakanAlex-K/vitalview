import React from 'react';
import { ArrowRight, FlaskConical, Radio, Sparkles, TriangleAlert } from 'lucide-react';

export function PageHeader({ title, subtitle, demo, onSwitchMode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="mode-switch" role="group" aria-label="Data source">
        <button
          className={demo ? 'chosen' : ''}
          aria-pressed={demo}
          onClick={() => !demo && onSwitchMode('demo')}
        >
          <Sparkles size={14} />
          Demo
        </button>
        <button
          className={!demo ? 'chosen' : ''}
          aria-pressed={!demo}
          onClick={() => demo && onSwitchMode('live')}
        >
          <Radio size={14} />
          Device
        </button>
      </div>
    </div>
  );
}

export function ConnectionNotice({ demo, online, simulated, onConnect, onConfigure }) {
  return (
    <>
      {demo ? (
        <div className="notice">
          <span className="notice-icon">
            <FlaskConical size={16} />
          </span>
          <span>
            <strong>Demo workspace.</strong> Signals and readings are synthetic. No device or model
            is running here.
          </span>
          <button onClick={onConnect}>
            Connect a device <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div className={'notice ' + (online ? 'ok' : 'warning')}>
          <span className="notice-icon">
            <Radio size={16} />
          </span>
          <span>
            <strong>
              {online ? 'Local backend connected.' : 'Waiting for the local backend.'}
            </strong>{' '}
            {online
              ? 'Only received captures appear here. Estimates are experimental.'
              : 'Start the server, then configure the connection.'}
          </span>
          <button onClick={onConfigure}>
            Configure <ArrowRight size={14} />
          </button>
        </div>
      )}
      {!demo && simulated && (
        <div className="notice warning">
          <span className="notice-icon">
            <TriangleAlert size={16} />
          </span>
          <span>
            <strong>Transport simulator.</strong> This upload contains generated samples, not a
            physical measurement.
          </span>
        </div>
      )}
    </>
  );
}
