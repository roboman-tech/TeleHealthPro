import { useRef, type InputHTMLAttributes } from 'react'

/** Calendar grid icon — thicker strokes, visible on both dark & light. */
function CalendarGridIcon({ withTime }: { withTime?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Body */}
      <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
      {/* Header separator */}
      <path d="M3 10h18" />
      {/* Binding pins */}
      <path d="M8 2.5V6M16 2.5V6" />
      {/* Date cell dots (row 1) */}
      <circle cx="8.5" cy="14" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="12" cy="14" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="14" r="1.25" fill="currentColor" stroke="none" />
      {withTime ? (
        /* Clock hands overlay for datetime-local */
        <path d="M15.5 12v2.25l1.25 0.85" strokeWidth={2} opacity={0.95} />
      ) : (
        /* Second row of dots for date-only */
        <>
          <circle cx="8.5" cy="17.5" r="1.25" fill="currentColor" stroke="none" opacity={0.5} />
          <circle cx="12" cy="17.5" r="1.25" fill="currentColor" stroke="none" opacity={0.5} />
        </>
      )}
    </svg>
  )
}

export type DateScheduleInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  inputType: 'datetime-local' | 'date'
  /** Extra class on outer shell (e.g. margin) */
  wrapClassName?: string
}

/**
 * Native date / datetime-local inside a calendar-card shell.
 * Clicking the icon rail opens the browser picker via showPicker().
 */
export function DateScheduleInput({
  inputType,
  wrapClassName = '',
  className = '',
  ...rest
}: DateScheduleInputProps) {
  const withTime = inputType === 'datetime-local'
  const inputRef = useRef<HTMLInputElement>(null)

  const openPicker = () => {
    const el = inputRef.current
    if (!el) return
    try {
      // showPicker() is supported in Chrome 99+, Firefox 101+, Safari 15.4+
      el.showPicker()
    } catch {
      el.focus()
    }
  }

  return (
    <div className={`th-date-schedule-wrap ${wrapClassName}`.trim()}>
      <div
        className={`th-date-schedule-monthstrip${withTime ? ' th-date-schedule-monthstrip--time' : ''}`}
        aria-hidden
      />
      <div className="th-date-schedule-inner">
        <button
          type="button"
          className="th-date-schedule-icon"
          onClick={openPicker}
          tabIndex={-1}
          aria-label={withTime ? 'Open date and time picker' : 'Open date picker'}
          title={withTime ? 'Click to open calendar & time picker' : 'Click to open calendar'}
        >
          <CalendarGridIcon withTime={withTime} />
        </button>
        <input
          ref={inputRef}
          type={inputType}
          className={`th-date-schedule-field ${className}`.trim()}
          {...rest}
        />
      </div>
    </div>
  )
}
