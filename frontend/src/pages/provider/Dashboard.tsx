import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { appointmentsApi } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { Card } from '../../components/ui'
import { PageTitle } from '../../components/ui'

function QuickNavCard({
  to,
  icon,
  title,
  description,
  accentClass,
}: {
  to: string
  icon: string
  title: string
  description: string
  accentClass: string
}) {
  return (
    <Link
      to={to}
      className="group relative flex flex-col rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-200 hover:border-teal-300/25 hover:from-white/[0.09] hover:to-white/[0.04] hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
    >
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl font-semibold text-slate-100 ${accentClass}`}
        aria-hidden
      >
        {icon}
      </div>
      <h3 className="mt-4 font-display text-lg font-semibold tracking-tight text-slate-50">{title}</h3>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-400">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-teal-200/90 transition group-hover:text-teal-100">
        Open
        <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>
          →
        </span>
      </span>
    </Link>
  )
}

export function ProviderDashboard() {
  const { token } = useAuth()
  const { data: appts } = useQuery({
    queryKey: ['appointments', 'mine', token],
    queryFn: () => appointmentsApi.mine(token!),
    enabled: !!token,
  })
  const pending = appts?.filter((a) => a.status === 'pending').length ?? 0
  const scheduled =
    appts?.filter((a) => a.status === 'pending' || a.status === 'approved').length ?? 0
  const completed = appts?.filter((a) => a.status === 'completed').length ?? 0
  const canceled =
    appts?.filter((a) => a.status === 'cancelled' || a.status === 'rejected').length ?? 0
  const total = appts?.length ?? 0

  return (
    <div className="th-page">
      <PageTitle
        kicker="Provider"
        title="Clinical workspace"
        subtitle="Triage bookings, open charts, and launch telehealth sessions."
      />
      <p className="th-muted th-mb th-stat-summary">
        Calendar totals: <strong>{total}</strong> appointment{total === 1 ? '' : 's'} (scheduled + completed +
        canceled).
      </p>
      <div className="th-metrics">
        <Card>
          <span className="th-stat-label">Pending approvals</span>
          <strong className="th-stat-val">{pending}</strong>
        </Card>
        <Card>
          <span className="th-stat-label">Scheduled</span>
          <strong className="th-stat-val">{scheduled}</strong>
          <span className="th-stat-hint">Pending + approved</span>
        </Card>
        <Card>
          <span className="th-stat-label">Completed</span>
          <strong className="th-stat-val">{completed}</strong>
        </Card>
        <Card>
          <span className="th-stat-label">Canceled</span>
          <strong className="th-stat-val">{canceled}</strong>
          <span className="th-stat-hint">Cancelled + rejected</span>
        </Card>
      </div>

      <section className="mt-8" aria-labelledby="provider-quick-nav-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="provider-quick-nav-heading"
              className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400"
            >
              Go to
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-400">
              Jump to the main clinical workflows. Each area opens in full workspace layout.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <QuickNavCard
            to="/provider/appointments"
            icon="◷"
            title="Appointments"
            description="Review requests, approve visits, manage telehealth rooms, and update visit status from one schedule."
            accentClass="bg-sky-500/15 ring-1 ring-sky-400/20"
          />
          <QuickNavCard
            to="/provider/patients"
            icon="☰"
            title="Patient charts"
            description="Assigned patients and today’s schedule with explicit clinical data load, chart tabs, and visit context."
            accentClass="bg-teal-500/15 ring-1 ring-teal-400/25"
          />
          <QuickNavCard
            to="/provider/fhir"
            icon="⎘"
            title="FHIR explorer"
            description="Look up Patient bundles from the integrated clinical store for interoperability review."
            accentClass="bg-violet-500/15 ring-1 ring-violet-400/20"
          />
        </div>
      </section>
    </div>
  )
}
