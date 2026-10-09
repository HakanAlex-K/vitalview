import React from 'react';
import { formatInteger } from '../lib/format.js';
import { channelStats } from '../lib/signal.js';

const CHANNELS = [
  ['ir', 'Infrared'],
  ['red', 'Red'],
];

/** DC level, AC swing and AC/DC ratio for each visible channel, computed from raw samples. */
export function ChannelStats({ samples, channel = 'both' }) {
  const visible = CHANNELS.filter(([key]) => channel === 'both' || channel === key);
  return (
    <div className="channel-stats">
      {visible.map(([key, name]) => {
        const stats = channelStats(samples, key);
        return (
          <div className="channel-stat" key={key}>
            <span className="channel-name">
              <i className={key} />
              {name}
            </span>
            <dl>
              <div>
                <dt>Mean (DC)</dt>
                <dd>{formatInteger(stats?.mean)}</dd>
              </div>
              <div>
                <dt>Peak-to-peak</dt>
                <dd>{formatInteger(stats?.peakToPeak)}</dd>
              </div>
              <div>
                <dt>AC / DC</dt>
                <dd>{stats?.acDc == null ? '—' : stats.acDc.toFixed(2) + '%'}</dd>
              </div>
            </dl>
          </div>
        );
      })}
    </div>
  );
}
