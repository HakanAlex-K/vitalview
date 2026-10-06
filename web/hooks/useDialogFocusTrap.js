import { useEffect } from 'react';

/** Keep keyboard focus inside the open dialog, close it on Escape, and restore focus afterwards. */
export function useDialogFocusTrap(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    const dialog = document.querySelector('[role=dialog]');
    const focusable = () =>
      [...dialog.querySelectorAll('button,input,select,[href]')].filter((el) => !el.disabled);
    focusable()[0]?.focus();
    const handle = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const els = focusable();
        if (e.shiftKey && document.activeElement === els[0]) {
          e.preventDefault();
          els.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === els.at(-1)) {
          e.preventDefault();
          els[0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('keydown', handle);
      previous?.focus();
    };
  }, [open]);
}
