import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
  actions: ReactNode;
}

/** Accessible modal built on the native <dialog> element (focus trap and Escape handling included). */
export function Dialog({ open, title, onClose, children, actions }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-lg bg-surface-container-lowest p-0 text-on-surface shadow-2xl backdrop:bg-inverse-surface/40 backdrop:backdrop-blur-sm"
    >
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <h2 id="dialog-title" className="font-display text-headline-sm text-on-surface">
            {title}
          </h2>
          <div className="text-body-md text-on-surface-variant">{children}</div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>
        </div>
      )}
    </dialog>
  );
}
