import React from 'react';
import { Download } from 'lucide-react';
import { StatusBadge } from './Badge.jsx';
import { Modal } from './Modal.jsx';
import { SignalPlot } from './SignalPlot.jsx';
import { download } from '../lib/download.js';
import { formatTime, formatValue, statusLabel } from '../lib/format.js';

export function CaptureDialog({ capture, onClose }) {
  const synthetic = capture.source === 'synthetic';
  const reason = capture.reason || capture.quality?.reasons?.join(' · ');

  return (
    <Modal
      className="capture-detail"
      labelledBy="capture-title"
      closeLabel="Close capture"
      onClose={onClose}
    >
      <StatusBadge status={capture.status}>{statusLabel(capture.status)}</StatusBadge>
      <h2 id="capture-title">Capture details</h2>
      <p>
        {formatTime(capture.receivedAt)} · {capture.source}
      </p>
      <div className="detail-value">
        {formatValue(capture.estimate)}
        <small>label units · {synthetic ? 'synthetic' : 'experimental'}</small>
      </div>
      {capture.samples ? (
        <>
          <SignalPlot samples={capture.samples} />
          <button
            className="secondary"
            onClick={() =>
              download(
                'vitalview-optical-capture.csv',
                'ir,red\n' + capture.samples.map((r) => `${r.ir},${r.red}`).join('\n'),
              )
            }
          >
            <Download size={15} />
            Export optical samples
          </button>
        </>
      ) : (
        <p className="microcopy">
          Older capture waveforms are not retained by the server. This log keeps only result
          metadata.
        </p>
      )}
      {reason && <div className="inline-error">{reason}</div>}
      <p className="microcopy">
        {synthetic
          ? 'Generated demonstration data.'
          : 'An experimental model output; not a validated glucose measurement.'}
      </p>
    </Modal>
  );
}
