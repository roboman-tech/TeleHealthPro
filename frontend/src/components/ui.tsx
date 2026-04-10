import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

export function Card({
  children,
  className = '',
  glow,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { glow?: boolean }) {
  return (
    <div
      className={`th-card ${glow ? 'th-card--glow' : ''} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  )
}

export function Button({
  children,
  variant = 'primary',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'accent'
}) {
  return (
    <button type={type} className={`th-btn th-btn--${variant} ${className}`.trim()} {...rest}>
      {children}
    </button>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'ok' | 'warn' | 'bad' | 'neutral' | 'info'
}) {
  return <span className={`th-badge th-badge--${tone}`}>{children}</span>
}

export function PageTitle({
  kicker,
  title,
  subtitle,
}: {
  kicker?: string
  title: string
  subtitle?: string
}) {
  return (
    <header className="th-page-head">
      {kicker ? <span className="th-kicker">{kicker}</span> : null}
      <h1>{title}</h1>
      {subtitle ? <p className="th-sub">{subtitle}</p> : null}
    </header>
  )
}
