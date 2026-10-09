import React from 'react';
import { Download, TriangleAlert } from 'lucide-react';
import { StatusBadge } from './Badge.jsx';
import { ChannelStats } from './ChannelStats.jsx';
import { Modal } from './Modal.jsx';
import { SignalPlot } from './SignalPlot.jsx';
import { download } from '../lib/download.js';
import { formatTime, formatValue, sourceLabel, statusLabel } from '../lib/format.js';

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
      <div className="modal-head">
        <StatusBadge status={capture.status}>{statusLabel(capture.status)}</StatusBadge>
        <h2 id="capture-title">Capture details</h2>
        <p>
          {formatTime(capture.receivedAt)} · {sourceLabel(capture.source)} ·{' '}
          <code>{capture.id.slice(0, 8)}</code>
        </p>
      </div>
      <div className="detail-value">
        <span>{formatValue(capture.estimate)}</span>
        <small>label units · {synthetic ? 'synthetic' : 'experimental'}</small>
      </div>
      {reason && (
        <div className="inline-error">
          <TriangleAlert size={15} />
          <span>{reason}</span>
        </div>
      )}
      {capture.samples ? (
        <>
          <SignalPlot samples={capture.samples} compact />
          <ChannelStats samples={capture.samples} />
          <button
            className="btn secondary wide"
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
        <p className="microcopy boxed">
          Older capture waveforms are not retained by the server. This log keeps only result
          metadata.
        </p>
      )}
      <p className="microcopy">
        {synthetic
          ? 'Generated demonstration data.'
          : 'An experimental model output; not a validated glucose measurement.'}
      </p>
    </Modal>
  );
}
