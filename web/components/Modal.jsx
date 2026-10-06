import React from 'react';
import { X } from 'lucide-react';

export function Modal({ className = '', labelledBy, closeLabel, onClose, children }) {
  return (
    <div className="modal-shade" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section
        className={('modal ' + className).trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <button className="close icon-button" aria-label={closeLabel} onClick={onClose}>
          <X size={20} />
        </button>
        {children}
      </section>
    </div>
  );
}
