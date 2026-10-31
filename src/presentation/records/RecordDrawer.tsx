import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowUpRight, X } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { cn } from '@/lib/cn'
import { defaultsFor } from '@/domain/records'
import { useAllRecords } from '../hooks/useRecords'
import { useServices } from '../hooks/useServices'
import { useSession } from '../hooks/useSession'
import { Button } from '../ui/Button'
import { RecordDrawerContext, createPageFor, type DrawerRequest } from './drawer'
import { RecordControls } from './RecordControls'
import { RecordForm } from './RecordForm'
import { StateBadge } from './StateBadge'
import { fieldText, recordPath, recordTitle } from './text'
import { useRecordActions } from './useRecordActions'

function Panel({ request, onClose, onSwitch }: { request: DrawerRequest; onClose: () => void; onSwitch: (r: DrawerRequest) => void }) {
  const all = useAllRecords()
  const actions = useRecordActions()
  const { clock } = useServices()
  const { role } = useSession()
  const panel = useRef<HTMLDivElement>(null)
  const type = typeOf(request.type)
  const record = request.mode === 'create' ? undefined : all.data?.[request.type]?.find((r) => r.id === request.id)

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      back?.focus()
    }
  }, [onClose])

  if (!type) return null
  const title = request.mode === 'create' ? `New ${type.singular.toLowerCase()}` : record ? recordTitle(type, record, all.data) : request.id

  let body: ReactNode = <p className="text-sm text-muted">Loading…</p>
  if (request.mode === 'create')
    body = (
      <RecordForm
        type={type}
        all={all.data}
        initial={{ ...defaultsFor(type, { entity: role.entity, today: clock.today() }), ...request.prefill }}
        submitLabel={`Create ${type.singular.toLowerCase()}`}
        onCancel={onClose}
        onSubmit={async (values) => {
          const saved = await actions.create(type, values)
          onSwitch({ mode: 'view', type: type.key, id: saved.id })
        }}
      />
    )
  else if (record && request.mode === 'edit')
    body = (
      <RecordForm
        type={type}
        all={all.data}
        initial={record.values}
        submitLabel="Save changes"
        onCancel={() => onSwitch({ mode: 'view', type: type.key, id: record.id })}
        onSubmit={async (values) => {
          await actions.update(type, record.id, values)
          onSwitch({ mode: 'view', type: type.key, id: record.id })
        }}
      />
    )
  else if (record)
    body = (
      <div className="space-y-4">
        <RecordControls type={type} record={record} className="rounded-panel bg-raised p-3" />
        <dl className="grid gap-2 sm:grid-cols-2">
          {type.fields.map((f) => (
            <div key={f.key} className="rounded-panel bg-raised p-3">
              <dt className="text-xs text-muted">{f.label}</dt>
              <dd className="mt-0.5 text-sm font-medium break-words">{fieldText(f, record.values[f.key], all.data)}</dd>
            </div>
          ))}
        </dl>
        <ol className="space-y-2">
          {[...record.history].reverse().slice(0, 5).map((h, i) => (
            <li key={`${h.at}-${i}`} className="text-xs">
              <span className="font-medium">{h.action}</span> <span className="text-muted">· {h.by} · {h.at.slice(0, 16).replace('T', ' ')}</span>
            </li>
          ))}
        </ol>
      </div>
    )
  else if (all.data) body = <p className="text-sm text-muted">This record no longer exists.</p>

  // A new record opens as a centred modal; viewing and editing keep the side drawer beside the list.
  const modal = request.mode === 'create'
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="drawer-title" className={cn('fixed inset-0 z-[900]', modal && 'grid place-items-center p-3 sm:p-6')}>
      <button type="button" aria-label="Close" className="absolute inset-0 animate-fade bg-ink/40" onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className={cn(
          'flex flex-col bg-card shadow-float outline-none',
          modal ? 'relative max-h-[92dvh] w-full max-w-2xl animate-rise overflow-hidden rounded-card' : 'absolute inset-y-0 right-0 w-full max-w-xl animate-slide-left',
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-xs text-muted">
              {type.name}
              {record && <span className="font-mono font-semibold text-fg">{record.id}</span>}
              {record && <StateBadge type={type} status={record.status} />}
            </p>
            <h2 id="drawer-title" className="mt-1 truncate text-lg font-semibold">
              {title}
            </h2>
          </div>
          {record && (
            <Link to={recordPath(type, record.id)} onClick={onClose} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent-text hover:underline">
              Full record <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          )}
          <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
            <X aria-hidden className="size-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{body}</div>
      </div>
    </div>
  )
}

/** Hosts one record drawer for the whole console, so any page can create, view, edit, step and delete records in place. */
export function RecordDrawerProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<DrawerRequest | null>(null)
  const navigate = useNavigate()
  const close = useCallback(() => setRequest(null), [])
  const open = useCallback(
    (r: DrawerRequest) => {
      const page = r.mode === 'create' && createPageFor(r.type, r.prefill)
      if (page) navigate(page)
      else setRequest(r)
    },
    [navigate],
  )
  return (
    <RecordDrawerContext.Provider value={open}>
      {children}
      {request && <Panel key={`${request.mode}-${request.type}-${'id' in request ? request.id : ''}`} request={request} onClose={close} onSwitch={setRequest} />}
    </RecordDrawerContext.Provider>
  )
}
