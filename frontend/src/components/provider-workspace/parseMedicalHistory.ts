/**
 * Parses plain-text medical history into fixed sections when the narrative uses
 * recognizable headers (standalone line, "Label:", markdown ##, or **bold**).
 * Text before any header is kept under Relevant history.
 */

export type MedicalHistorySectionKey = 'allergies' | 'conditions' | 'medications' | 'surgeries' | 'relevantHistory'

export type MedicalHistorySections = Record<MedicalHistorySectionKey, string>

export const MEDICAL_HISTORY_SECTION_ORDER: MedicalHistorySectionKey[] = [
  'allergies',
  'conditions',
  'medications',
  'surgeries',
  'relevantHistory',
]

export const MEDICAL_HISTORY_SECTION_LABELS: Record<MedicalHistorySectionKey, string> = {
  allergies: 'Allergies',
  conditions: 'Conditions',
  medications: 'Medications',
  surgeries: 'Surgeries',
  relevantHistory: 'Relevant history',
}

function nameToKey(name: string): MedicalHistorySectionKey | null {
  const n = name
    .trim()
    .toLowerCase()
    .replace(/[:：]+$/g, '')
    .replace(/\s+/g, ' ')
  const map: Record<string, MedicalHistorySectionKey> = {
    allergies: 'allergies',
    allergy: 'allergies',
    conditions: 'conditions',
    condition: 'conditions',
    medications: 'medications',
    medication: 'medications',
    meds: 'medications',
    surgeries: 'surgeries',
    surgery: 'surgeries',
    'relevant history': 'relevantHistory',
    relevant: 'relevantHistory',
    notes: 'relevantHistory',
    other: 'relevantHistory',
    'additional history': 'relevantHistory',
  }
  return map[n] ?? null
}

/** Recognized header on its own line (optional trailing colon). */
const STANDALONE_HEADER =
  /^\s*(Allergies|Conditions|Medications|Surgeries|Relevant\s+history)\s*[:：]?\s*$/i

/** Same labels with body on the same line after ":" */
const INLINE_HEADER =
  /^\s*(Allergies|Conditions|Medications|Surgeries|Relevant\s+history)\s*[:：]\s*(.*)$/i

/** Markdown ATX heading: ## Allergies */
const MD_HEADING = /^\s{0,3}#{1,6}\s+(.+?)\s*$/i

/** **Allergies** or **Allergies:** optional same-line body */
const BOLD_HEADER = /^\s*\*\*(.+?)\*\*\s*[:：]?\s*(.*)$/

function append(section: MedicalHistorySections, key: MedicalHistorySectionKey, line: string) {
  const t = line
  if (!section[key]) section[key] = t
  else section[key] += `\n${t}`
}

export function parseMedicalHistoryNarrative(raw: string): MedicalHistorySections {
  const out: MedicalHistorySections = {
    allergies: '',
    conditions: '',
    medications: '',
    surgeries: '',
    relevantHistory: '',
  }
  if (!raw?.trim()) return out

  let current: MedicalHistorySectionKey = 'relevantHistory'

  for (const line of raw.split(/\r?\n/)) {
    const standalone = line.match(STANDALONE_HEADER)
    if (standalone) {
      const key = nameToKey(standalone[1].replace(/\s+/g, ' '))
      if (key) {
        current = key
        continue
      }
    }

    const inline = line.match(INLINE_HEADER)
    if (inline) {
      const key = nameToKey(inline[1].replace(/\s+/g, ' '))
      if (key) {
        current = key
        if (inline[2]?.trim()) append(out, current, inline[2])
        continue
      }
    }

    const md = line.match(MD_HEADING)
    if (md) {
      const key = nameToKey(md[1])
      if (key) {
        current = key
        continue
      }
    }

    const bold = line.match(BOLD_HEADER)
    if (bold) {
      const key = nameToKey(bold[1])
      if (key) {
        current = key
        if (bold[2]?.trim()) append(out, current, bold[2])
        continue
      }
    }

    append(out, current, line)
  }

  for (const k of MEDICAL_HISTORY_SECTION_ORDER) {
    out[k] = out[k].trim()
  }
  return out
}

export function hasAnyHistorySectionContent(sections: MedicalHistorySections): boolean {
  return MEDICAL_HISTORY_SECTION_ORDER.some((k) => sections[k].trim().length > 0)
}
