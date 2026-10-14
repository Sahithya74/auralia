import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size = 'md' | 'lg' | 'sm';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary-strong text-on-primary shadow-md shadow-primary-container/20 hover:bg-primary active:bg-primary disabled:opacity-50',
  secondary: 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest disabled:text-on-surface-variant disabled:opacity-60',
  soft: 'bg-tertiary-fixed/70 text-on-tertiary-container hover:bg-tertiary-fixed disabled:opacity-60',
  ghost: 'bg-transparent text-on-surface-variant hover:bg-surface-container/70 disabled:opacity-50',
  danger: 'bg-error text-on-primary hover:brightness-95 active:brightness-90 disabled:opacity-60',
};

const SIZES: Record<Size, string> = {
  sm: 'min-h-10 px-4 text-label-md gap-1.5',
  md: 'min-h-12 px-6 text-label-lg gap-2',
  lg: 'min-h-14 px-7 text-label-lg gap-2.5',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `inline-flex items-center justify-center rounded-full font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed select-none ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, `${block ? 'w-full' : ''} ${className}`)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={18} /> : icon}
      {children}
    </button>
  );
});

interface ButtonLinkProps extends LinkProps {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  block?: boolean;
}

export function ButtonLink({ variant = 'primary', size = 'md', icon, block, className = '', children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, `${block ? 'w-full' : ''} ${className}`)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  tone?: 'plain' | 'soft';
}

export function IconButton({ label, children, tone = 'plain', className = '', type = 'button', ...rest }: IconButtonProps) {
  const toneClass = tone === 'soft' ? 'bg-surface-container shadow-sm' : 'bg-transparent';
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface active:scale-95 disabled:opacity-40 ${toneClass} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
