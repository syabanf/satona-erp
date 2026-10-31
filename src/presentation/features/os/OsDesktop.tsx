import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { BarChart3, Bell, CheckCheck, Factory, HardHat, House, LayoutGrid, LogOut, Maximize2, Minimize2, Minus, Search, ShieldCheck, Truck, Users, Wallet, X } from 'lucide-react'
import { moduleLabel } from '@/domain/uiLabels'
import { cn } from '@/lib/cn'
import { useAlerts } from '../../hooks/useAlerts'
import { useAccess, useApprovals } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { BrandMark } from '../../ui/BrandMark'
import { prefersReducedMotion } from '../../ui/animate'
import { moduleIcon } from '../../ui/moduleIcons'
import { ViewSwitch } from '../../layouts/ViewSwitch'
import { PhoneOs } from './PhoneOs'
import type { App, Win } from './types'

const PINNED: readonly App[] = [
  { id: 'home', title: 'Beranda', icon: House, url: '/' },
  { id: 'approvals', title: 'Persetujuan', icon: CheckCheck, url: '/approvals' },
  { id: 'fleet', title: 'Armada', icon: Truck, url: '/fleet' },
  { id: 'production', title: 'Produksi', icon: Factory, url: '/mes/cockpit' },
  { id: 'she', title: 'Keselamatan', icon: HardHat, url: '/she' },
  { id: 'finance', title: 'Keuangan', icon: Wallet, url: '/finance' },
  { id: 'hris', title: 'SDM', icon: Users, url: '/hris' },
  { id: 'analytics', title: 'Analitik', icon: BarChart3, url: '/analytics' },
  { id: 'coverage', title: 'Cakupan', icon: ShieldCheck, url: '/coverage' },
]

const phoneQuery = window.matchMedia('(max-width: 767px)')
const onPhoneChange = (fn: () => void) => {
  phoneQuery.addEventListener('change', fn)
  return () => phoneQuery.removeEventListener('change', fn)
}

const clockText = (d: Date) => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
const dateText = (d: Date) => d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })

/** One app window: drag by the title bar, resize from the corner, double-click the title to maximise. The page runs in a frame. */
function Window({ win, active, gliding, onFocus, onChange, onClose, onDragging }: { win: Win; active: boolean; gliding: boolean; onFocus: () => void; onChange: (patch: Partial<Win>) => void; onClose: () => void; onDragging: (on: boolean) => void }) {
  const [loaded, setLoaded] = useState(false)
  const start = useRef<{ px: number; py: number; x: number; y: number; w: number; h: number; mode: 'move' | 'size' } | null>(null)

  const begin = (e: ReactPointerEvent, mode: 'move' | 'size') => {
    if (win.max || (e.target as HTMLElement).closest('button')) return
    onFocus()
    start.current = { px: e.clientX, py: e.clientY, x: win.x, y: win.y, w: win.w, h: win.h, mode }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    onDragging(true)
  }
  const move = (e: ReactPointerEvent) => {
    const s = start.current
    if (!s) return
    const dx = e.clientX - s.px
    const dy = e.clientY - s.py
    if (s.mode === 'move') onChange({ x: Math.max(-s.w + 120, s.x + dx), y: Math.max(0, s.y + dy) })
    else onChange({ w: Math.max(360, s.w + dx), h: Math.max(260, s.h + dy) })
  }
  const end = () => {
    start.current = null
    onDragging(false)
  }

  return (
    <section
      role="dialog"
      aria-label={win.app.title}
      onPointerDown={onFocus}
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return
        if (win.anim === 'close') onClose()
        else onChange(win.anim === 'min' ? { min: true, anim: undefined } : { anim: undefined })
      }}
      className={cn(
        'absolute flex flex-col overflow-hidden border bg-canvas shadow-float',
        win.max ? 'rounded-none' : 'rounded-2xl',
        active ? 'border-line-strong' : 'border-line',
        win.min && 'hidden',
        gliding && 'os-glide',
        win.anim && `os-${win.anim}`,
      )}
      style={win.max ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: win.z } : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z }}
    >
      <header
        onPointerDown={(e) => begin(e, 'move')}
        onPointerMove={move}
        onPointerUp={end}
        onDoubleClick={() => onChange({ max: !win.max })}
        className={cn('flex h-11 shrink-0 cursor-grab items-center gap-2 border-b border-line px-3 select-none active:cursor-grabbing', active ? 'bg-card' : 'bg-raised')}
      >
        <win.app.icon aria-hidden className="size-4 text-muted" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{win.app.title}</span>
        <button type="button" aria-label={`Kecilkan ${win.app.title}`} onClick={() => onChange({ anim: 'min' })} className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-control">
          <Minus aria-hidden className="size-4" />
        </button>
        <button type="button" aria-label={win.max ? 'Kembalikan ukuran' : 'Perbesar'} onClick={() => onChange({ max: !win.max })} className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-control">
          {win.max ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
        </button>
        <button type="button" aria-label={`Tutup ${win.app.title}`} onClick={() => onChange({ anim: 'close' })} className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-accent hover:text-white">
          <X aria-hidden className="size-4" />
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        {!loaded && <p className="absolute inset-0 grid place-items-center text-sm text-muted">Membuka {win.app.title}…</p>}
        <iframe title={win.app.title} src={win.app.url} onLoad={() => setLoaded(true)} className={cn('size-full border-0', !loaded && 'opacity-0')} />
      </div>
      {!win.max && <span aria-hidden onPointerDown={(e) => begin(e, 'size')} onPointerMove={move} onPointerUp={end} className="absolute right-0 bottom-0 size-4 cursor-nwse-resize" />}
    </section>
  )
}

/**
 * The ERP as a desktop (a phone OS below 768 px): apps on the desktop and in a dock, each opening as a window that can be dragged,
 * resized, stacked, minimised to the dock and maximised. A top bar keeps the clock, alerts and the way back.
 */
export default function OsDesktop() {
  const { signedIn, role, signOut } = useSession()
  const navigate = useNavigate()
  const { erp } = useServices()
  const accessFor = useAccess()
  const approvals = useApprovals()
  const alerts = useAlerts()
  const modules = useResource('erp.modules', () => erp.modules())
  const [wins, setWins] = useState<Win[]>([])
  const [launcher, setLauncher] = useState(false)
  const [query, setQuery] = useState('')
  const [dragging, setDragging] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [bouncing, setBouncing] = useState<string | null>(null)
  const bounce = (id: string) => {
    setBouncing(null)
    requestAnimationFrame(() => setBouncing(id))
  }
  const phone = useSyncExternalStore(onPhoneChange, () => phoneQuery.matches)
  const desk = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)
  const top = useRef(10)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])

  const apps = useMemo<App[]>(
    () =>
      [...PINNED, ...(modules.data ?? []).filter((m) => accessFor(m.id) !== 'none').map((m) => ({ id: `m-${m.id}`, title: moduleLabel(m.id, m.name), icon: moduleIcon(m.id), url: `/menu/${m.id}` }))]
        // A module named like a pinned app (SDM) shows once.
        .filter((a, i, all) => all.findIndex((b) => b.title === a.title) === i),
    [modules.data, accessFor],
  )
  const activeId = wins.filter((w) => !w.min).sort((a, b) => b.z - a.z)[0]?.id

  if (!signedIn) return <Navigate to="/login" replace />

  const focus = (id: number) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, z: ++top.current, min: false, anim: w.min ? 'open' : w.anim } : w)))
  const patch = (id: number, p: Partial<Win>) => {
    // Without motion no animation ends, so closing and minimising happen at once.
    if (prefersReducedMotion() && p.anim === 'close') return setWins((ws) => ws.filter((w) => w.id !== id))
    const next = prefersReducedMotion() && p.anim === 'min' ? { min: true, anim: undefined } : p
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, ...next } : w)))
  }
  const open = (app: App) => {
    setLauncher(false)
    const running = wins.find((w) => w.app.id === app.id)
    if (running) return focus(running.id)
    const area = desk.current?.getBoundingClientRect()
    const width = area?.width ?? 1200
    const height = area?.height ?? 700
    const n = wins.length % 6
    setWins((ws) => [...ws, { id: nextId.current++, app, x: 140 + n * 36, y: 24 + n * 30, w: Math.min(1040, width - 180), h: Math.min(680, height - 60), z: ++top.current, min: false, max: false, anim: 'open' }])
    bounce(app.id)
  }
  const dockClick = (app: App) => {
    const running = wins.find((w) => w.app.id === app.id)
    if (running && running.id === activeId && !running.min) return patch(running.id, { anim: 'min' })
    open(app)
  }
  const signOutNow = () => {
    signOut()
    navigate('/login', { replace: true })
  }
  const remove = (id: number) => setWins((ws) => ws.filter((w) => w.id !== id))

  if (phone)
    return <PhoneOs apps={apps} wins={wins} now={now} roleName={role.name} waiting={approvals.length + alerts.length} approvals={approvals.length} onOpen={open} onPatch={patch} onRemove={remove} onSignOut={signOutNow} />

  const dockApps = [...PINNED, ...wins.map((w) => w.app).filter((a) => !PINNED.some((p) => p.id === a.id))]
  const shown = apps.filter((a) => a.title.toLowerCase().includes(query.trim().toLowerCase()))
  const title = wins.find((w) => w.id === activeId)?.app.title

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-card px-4">
        <BrandMark className="size-6 shrink-0" />
        <span className="text-sm font-semibold whitespace-nowrap">Satona OS</span>
        {title && <span className="truncate text-sm text-muted">· {title}</span>}
        <h1 className="sr-only">Satona OS</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex h-10 items-center rounded-full border border-line bg-raised p-1">
            <button type="button" onClick={() => open(PINNED[1]!)} className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-medium hover:bg-card">
              <Bell aria-hidden className="size-4" />
              <span className="tabular">{approvals.length + alerts.length}</span>
              <span className="sr-only">hal menunggu</span>
            </button>
            <span aria-hidden className="h-5 w-px bg-line-strong" />
            <span className="inline-flex h-8 items-center gap-1.5 px-3 text-sm">
              <span className="font-semibold tabular">{clockText(now)}</span>
              <span className="text-muted">{dateText(now)}</span>
            </span>
            <span aria-hidden className="hidden h-5 w-px bg-line-strong md:block" />
            <span className="hidden h-8 items-center gap-2 pr-2 pl-1 text-sm md:inline-flex">
              <span className="grid size-6 place-items-center rounded-full bg-accent text-[10px] font-bold text-white">{role.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('')}</span>
              <span className="max-w-52 truncate">{role.name}</span>
            </span>
          </div>
          <ViewSwitch current="os" />
          <button
            type="button"
            onClick={signOutNow}
            aria-label="Keluar"
            title="Keluar"
            className="grid size-10 cursor-pointer place-items-center rounded-full border border-line-strong bg-card text-accent-text hover:bg-accent-soft"
          >
            <LogOut aria-hidden className="size-4" />
          </button>
        </div>
      </header>

      <div ref={desk} className="relative min-h-0 flex-1 bg-[radial-gradient(var(--color-line-strong)_1px,transparent_1px)] [background-size:22px_22px]">
        <ul aria-label="Aplikasi di desktop" className="absolute top-4 left-4 grid grid-flow-col grid-rows-[repeat(5,auto)] gap-2">
          {PINNED.map((a, i) => (
            <li key={a.id} className="os-icon-in" style={{ animationDelay: `${i * 45}ms` }}>
              <button type="button" onClick={() => open(a)} className="flex w-24 cursor-pointer flex-col items-center gap-1.5 rounded-2xl p-2 text-center hover:bg-card/80">
                <span className="grid size-14 place-items-center rounded-2xl bg-card shadow-card">
                  <a.icon aria-hidden className="size-6 text-fg" />
                </span>
                <span className="text-xs leading-tight font-medium">{a.title}</span>
              </button>
            </li>
          ))}
        </ul>

        {wins.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <p className="text-2xl font-semibold">Selamat datang di Satona OS</p>
              <p className="mt-1 text-sm text-muted">Klik ikon aplikasi untuk membukanya sebagai jendela. Buka beberapa sekaligus dan atur posisinya.</p>
            </div>
          </div>
        )}

        {wins.map((w) => (
          <Window key={w.id} win={w} active={w.id === activeId} gliding={!dragging} onFocus={() => w.id !== activeId && focus(w.id)} onChange={(p) => patch(w.id, p)} onClose={() => remove(w.id)} onDragging={setDragging} />
        ))}
        {/* While a window moves, a shield keeps the frames from swallowing the pointer. */}
        {dragging && <div className="absolute inset-0 z-[9999] cursor-grabbing" />}

        {launcher && (
          <div role="dialog" aria-label="Semua aplikasi" className="absolute inset-x-3 bottom-24 z-[10000] mx-auto max-w-3xl animate-rise rounded-card border border-line bg-card p-4 shadow-float">
            <label className="flex h-11 items-center gap-2 rounded-xl border border-line bg-raised px-3">
              <Search aria-hidden className="size-4 text-subtle" />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari aplikasi, misalnya: gudang" aria-label="Cari aplikasi" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
            </label>
            <ul className="mt-3 grid max-h-[50dvh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
              {shown.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => open(a)} className="flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-2xl p-2 text-center hover:bg-raised">
                    <span className="grid size-12 place-items-center rounded-2xl bg-raised">
                      <a.icon aria-hidden className="size-5 text-fg" />
                    </span>
                    <span className="text-xs leading-tight">{a.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <nav aria-label="Dock" className="pointer-events-none absolute inset-x-0 bottom-3 z-[10001] flex justify-center px-3">
        <ul className="no-scrollbar pointer-events-auto flex max-w-full items-end gap-1.5 overflow-x-auto rounded-[22px] border border-line bg-card/95 p-2 shadow-float backdrop-blur">
          <li>
            <button type="button" aria-label="Semua aplikasi" aria-expanded={launcher} onClick={() => setLauncher((l) => !l)} className={cn('grid size-12 cursor-pointer place-items-center rounded-2xl transition-colors', launcher ? 'bg-accent text-white' : 'bg-invert text-on-invert')}>
              <LayoutGrid aria-hidden className="size-5" />
            </button>
          </li>
          {dockApps.map((a) => {
            const running = wins.find((w) => w.app.id === a.id)
            return (
              <li key={a.id} className="flex flex-col items-center">
                <button type="button" title={a.title} aria-label={a.title} onClick={() => dockClick(a)} onAnimationEnd={() => setBouncing(null)} className={cn('grid size-12 cursor-pointer place-items-center rounded-2xl transition-[translate,scale,background-color] hover:-translate-y-1 hover:scale-110', bouncing === a.id && 'os-bounce', running && running.id === activeId && !running.min ? 'bg-accent-soft text-accent-text' : 'bg-raised text-fg hover:bg-control')}>
                  <a.icon aria-hidden className="size-5" />
                </button>
                <span aria-hidden className={cn('mt-1 size-1.5 rounded-full', running ? 'bg-accent' : 'bg-transparent')} />
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
