import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface FoldPanelProps {
  icon?: string
  title: string
  hint?: string
  meta?: ReactNode
  action?: {
    to: string
    label: string
  }
  defaultOpen?: boolean
  children: ReactNode
}

// FoldPanel menyembunyikan tabel/daftar di balik tombol dropdown agar
// dashboard tidak penuh tabel. Header tetap menampilkan ringkasan angka.
export default function FoldPanel({
  icon,
  title,
  hint,
  meta,
  action,
  defaultOpen = false,
  children,
}: FoldPanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()

  return (
    <section className={`fold-panel${open ? ' is-open' : ''}`}>
      <div className="fold-head">
        <button
          type="button"
          className="fold-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
        >
          {icon && (
            <span className="fold-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="fold-copy">
            <strong>{title}</strong>
            {hint && <small>{hint}</small>}
          </span>
          {meta != null && <span className="fold-meta">{meta}</span>}
          <span className="fold-chevron" aria-hidden="true">
            ▾
          </span>
        </button>

        {action && (
          <Link className="fold-action" to={action.to}>
            {action.label} →
          </Link>
        )}
      </div>

      {open && (
        <div className="fold-body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
  )
}
