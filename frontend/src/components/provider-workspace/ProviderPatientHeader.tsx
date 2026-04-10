import type { ProviderScheduleRow } from './types'

export function ProviderPatientHeader({
  selected,
  clinicalLoaded,
  fhirPatientId,
  clinicalLastLoadedAt,
  onLoadClinical,
  onRefresh,
  onStartTelehealth,
  onAddNote,
  loadingClinical,
}: {
  selected: ProviderScheduleRow
  clinicalLoaded: boolean
  fhirPatientId: string | null
  clinicalLastLoadedAt: string | null
  loadingClinical: boolean
  onLoadClinical: () => void
  onRefresh: () => void
  onStartTelehealth: () => void
  onAddNote: () => void
}) {
  const when = `${new Date(selected.startAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}–${new Date(
    selected.endAt,
  ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`

  return (
    <div className="sticky top-0 z-10 -mx-6 mb-4 border-b border-white/10 bg-[#070b14]/80 px-6 py-4 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold text-slate-50">{selected.patientName}</h2>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-slate-300">
              {when}
            </span>
            {clinicalLoaded && fhirPatientId ? (
              <span className="rounded-full border border-teal-300/20 bg-teal-400/10 px-2 py-0.5 text-xs text-teal-200">
                FHIR: {fhirPatientId}
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
            <span>
              <span className="text-slate-400">Visit reason</span>: {selected.reason}
            </span>
            {clinicalLoaded && clinicalLastLoadedAt ? (
              <span>
                <span className="text-slate-400">Last loaded</span>: {clinicalLastLoadedAt}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            className="rounded-lg bg-teal-400/15 px-3 py-2 text-sm font-semibold text-teal-100 hover:bg-teal-400/20 disabled:opacity-50"
            onClick={onLoadClinical}
            disabled={loadingClinical}
          >
            {loadingClinical ? 'Loading…' : 'Load Clinical Data'}
          </button>
          <button
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-white/[0.06]"
            onClick={onRefresh}
            disabled={!clinicalLoaded}
          >
            Refresh
          </button>
          <button
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-white/[0.06]"
            onClick={onStartTelehealth}
          >
            Start Telehealth
          </button>
          <button
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-white/[0.06]"
            onClick={onAddNote}
          >
            Add Note
          </button>
        </div>
      </div>
    </div>
  )
}

