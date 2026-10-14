import { forwardRef, useEffect, useImperativeHandle, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icons';

interface ComposerProps {
  value: string;
  onChange(value: string): void;
  onSubmit(): void;
  disabled: boolean;
  placeholder: string;
  language: string;
  /** Slot before the text field, e.g. the microphone button. */
  leading?: ReactNode;
}

export interface ComposerHandle {
  focus(): void;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { value, onChange, onSubmit, disabled, placeholder, language, leading },
  ref,
) {
  const { t } = useTranslation();
  const textarea = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => textarea.current?.focus() }));

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Never submit while an input method (e.g. Tamil or Hindi transliteration) is composing.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!disabled && value.trim()) onSubmit();
    }
  }

  const canSend = !disabled && value.trim().length > 0;

  return (
    <form
      className="flex items-end gap-2 rounded-[1.75rem] bg-surface-container-lowest p-1.5 shadow-md focus-within:ring-3 focus-within:ring-primary-container/30"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      {leading}
      <label htmlFor="composer" className="sr-only">
        {placeholder}
      </label>
      <textarea
        id="composer"
        ref={textarea}
        rows={1}
        lang={language}
        value={value}
        maxLength={4000}
        enterKeyHint="send"
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none"
      />
      <button
        type="submit"
        aria-label={t('chat.send')}
        title={t('chat.send')}
        disabled={!canSend}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors active:scale-95 ${
          canSend ? 'bg-primary-fixed text-on-primary-fixed hover:bg-secondary-fixed' : 'bg-surface-container-high text-on-surface-variant'
        }`}
      >
        <Icon name="arrow_upward" size={20} />
      </button>
    </form>
  );
});
