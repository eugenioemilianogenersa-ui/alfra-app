// app/(components)/Card.tsx
export function Card({ title, description, children }: {
  title?: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm shadow-sm">
      {(title || description) && (
        <div className="border-b border-slate-100 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  )
}
