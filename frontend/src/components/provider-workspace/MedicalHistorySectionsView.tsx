import { useMemo } from 'react'
import {
  MEDICAL_HISTORY_SECTION_LABELS,
  MEDICAL_HISTORY_SECTION_ORDER,
  type MedicalHistorySectionKey,
  hasAnyHistorySectionContent,
  parseMedicalHistoryNarrative,
} from './parseMedicalHistory'

const sectionAccent: Record<MedicalHistorySectionKey, string> = {
  allergies: 'text-rose-200/90',
  conditions: 'text-amber-200/90',
  medications: 'text-violet-200/90',
  surgeries: 'text-cyan-200/90',
  relevantHistory: 'text-slate-200/90',
}

type Props = {
  historyText: string | null | undefined
  /** Tighter spacing for overview card */
  compact?: boolean
  emptyMessage?: string
}

export function MedicalHistorySectionsView({
  historyText,
  compact,
  emptyMessage = 'No medical history on file.',
}: Props) {
  const sections = useMemo(() => parseMedicalHistoryNarrative(historyText?.trim() ? historyText : ''), [historyText])
  const hasAny = hasAnyHistorySectionContent(sections)

  if (!hasAny) {
    return <p className="text-sm leading-relaxed text-slate-300">{emptyMessage}</p>
  }

  const gap = compact ? 'space-y-2.5' : 'space-y-4'
  const boxPad = compact ? 'p-2.5' : 'p-3'

  return (
    <div className={gap}>
      {MEDICAL_HISTORY_SECTION_ORDER.map((key) => {
        const body = sections[key].trim()
        return (
          <div key={key} className={`rounded-lg border border-white/10 bg-black/25 ${boxPad}`}>
            <div className={`text-[11px] font-semibold uppercase tracking-wide ${sectionAccent[key]}`}>
              {MEDICAL_HISTORY_SECTION_LABELS[key]}
            </div>
            <div className="mt-1.5 text-sm leading-relaxed text-slate-100 whitespace-pre-wrap break-words">
              {body ? body : '— None documented —'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
