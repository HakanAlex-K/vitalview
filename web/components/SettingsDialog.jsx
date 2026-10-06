import React, { useState } from 'react';
import { ArrowRight, Settings2 } from 'lucide-react';
import { Modal } from './Modal.jsx';

const isHttpUrl = (value) => {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** Edits a draft copy of the connection; nothing changes until the user saves. */
export function SettingsDialog({ api, token, onSave, onInvalid, onClose }) {
  const [draftApi, setDraftApi] = useState(api);
  const [draftToken, setDraftToken] = useState(token);

  function save() {
    if (draftApi && !isHttpUrl(draftApi)) {
      onInvalid();
      return;
    }
    onSave(draftApi.replace(/\/$/, ''), draftToken);
  }

  return (
    <Modal labelledBy="settings-title" closeLabel="Close settings" onClose={onClose}>
      <Settings2 size={25} />
      <h2 id="settings-title">Connect your workspace</h2>
      <p>
        Run the included Node server locally. Use the same origin, or enter the address of your own
        backend.
      </p>
      <label>
        API base URL
        <input
          autoFocus
          value={draftApi}
          onChange={(e) => setDraftApi(e.target.value)}
          placeholder="Same origin (recommended)"
        />
      </label>
      <label>
        API token
        <input
          type="password"
          value={draftToken}
          onChange={(e) => setDraftToken(e.target.value)}
          placeholder="Only if configured on your server"
          autoComplete="off"
        />
      </label>
      <p className="microcopy">
        The token stays in memory and is cleared on reload. Device IP is configured on the server
        with ESP32_URL.
      </p>
      <button className="primary wide" onClick={save}>
        Save & connect <ArrowRight size={16} />
      </button>
    </Modal>
  );
}
