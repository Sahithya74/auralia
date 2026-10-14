import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from './Icons';

const fieldBase =
  'w-full rounded-[1.25rem] border-[1.5px] border-line bg-surface px-5 py-4 text-body-md text-on-surface placeholder:text-on-surface-variant/55 transition-all focus:border-primary-container focus:outline-none focus:ring-4 focus:ring-primary-container/15 aria-[invalid=true]:border-error';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, id, type = 'text', className = '', ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = [hint && `${inputId}-hint`, error && `${inputId}-error`].filter(Boolean).join(' ') || undefined;
  const [reveal, setReveal] = useState(false);
  const { t } = useTranslation();
  const isPassword = type === 'password';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-label-lg font-semibold text-on-surface">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={isPassword && reveal ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`${fieldBase} ${isPassword ? 'pr-14' : ''}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? t('auth.hidePassword') : t('auth.showPassword')}
            aria-pressed={reveal}
            className="absolute inset-y-0 right-1.5 my-auto flex h-11 w-11 items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface"
          >
            <Icon name={reveal ? 'visibility_off' : 'visibility'} size={22} />
          </button>
        )}
      </div>
      {hint && (
        <p id={`${inputId}-hint`} className="text-label-md text-on-surface-variant">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} className="text-label-md font-semibold text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  hideLabel?: boolean;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hideLabel, id, className = '', ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : 'text-label-lg font-semibold text-on-surface'}>
        {label}
      </label>
      <textarea ref={ref} id={inputId} className={`${fieldBase} resize-none ${className}`} {...rest} />
    </div>
  );
});

interface ToggleProps {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange(checked: boolean): void;
  disabled?: boolean;
}

export function Toggle({ label, hint, checked, onChange, disabled }: ToggleProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex flex-col">
        <label htmlFor={id} className="text-label-lg font-semibold text-on-surface">
          {label}
        </label>
        {hint && (
          <span id={`${id}-hint`} className="text-label-md text-on-surface-variant">
            {hint}
          </span>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50 ${
          checked ? 'bg-primary' : 'bg-surface-container-highest'
        }`}
      >
        <span
          className={`inline-block h-6 w-6 rounded-full bg-surface-container-lowest shadow transition-transform duration-200 ${
            checked ? 'translate-x-7' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

interface ChoiceCardProps {
  name: string;
  value: string;
  checked: boolean;
  onChange(value: string): void;
  title: string;
  description?: string;
  /** Leading decorative icon (onboarding). */
  icon?: ReactNode;
  /** Trailing Material Symbol shown on the right, as in the Privacy design. */
  trailingIcon?: IconName;
  badge?: string;
  /** Shown only while selected, e.g. "Active sanctuary mode". */
  activeBadge?: string;
  lang?: string;
  children?: ReactNode;
}

/** Radio-backed card: the selected one lifts onto white with a check, as in the "How Anbu listens" design. */
export function ChoiceCard({ name, value, checked, onChange, title, description, icon, trailingIcon, badge, activeBadge, lang, children }: ChoiceCardProps) {
  const id = useId();
  return (
    <div
      className={`relative flex flex-col gap-1 rounded-lg p-4 transition-all duration-300 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-primary-container ${
        checked ? 'bg-surface-container-lowest shadow-card' : 'bg-surface-container-low hover:bg-surface-container'
      }`}
    >
      <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-2">
        <input id={id} type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} className="sr-only" />
        <span className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
              checked ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-transparent'
            }`}
          >
            <Icon name="check" size={15} />
          </span>
          {icon && <span className="mt-0.5 text-primary">{icon}</span>}
          <span className="flex flex-col">
            <span className="text-label-lg font-semibold text-on-surface" lang={lang}>
              {title}
            </span>
            {checked && activeBadge && (
              <span className="mt-0.5 inline-block self-start rounded-full bg-primary-fixed/60 px-2 py-0.5 text-label-sm text-primary">{activeBadge}</span>
            )}
            {badge && <span className="mt-0.5 inline-block self-start rounded-full bg-tertiary-fixed px-2 py-0.5 text-label-sm text-on-tertiary-container">{badge}</span>}
          </span>
        </span>
        {trailingIcon && <Icon name={trailingIcon} size={22} className={checked ? 'text-primary' : 'text-outline'} />}
      </label>
      {description && <p className="mt-1 pl-9 text-body-md text-on-surface-variant">{description}</p>}
      {children && <div className="pl-9">{children}</div>}
    </div>
  );
}
