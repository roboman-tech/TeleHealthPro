export function ClinicalEmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-[260px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/10 text-teal-200">
          ⎘
        </div>
        <h3 className="text-lg font-semibold text-slate-50">{title}</h3>
        <p className="mt-2 text-sm text-slate-300">{body}</p>
        {action ? <div className="mt-5 flex justify-center gap-2">{action}</div> : null}
      </div>
    </div>
  )
}

