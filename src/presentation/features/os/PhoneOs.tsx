import { useState } from 'react'
import { Bell, ChevronLeft, LogOut, Search, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { BrandMark } from '../../ui/BrandMark'
import { ViewSwitch } from '../../layouts/ViewSwitch'
import type { App, Win } from './types'

const DOCK = ['home', 'approvals', 'fleet', 'production']

/** One app on the phone: full screen, a back button to the home screen, and the home bar at the bottom. */
function PhoneApp({ win, onChange, onClose }: { win: Win; onChange: (patch: Partial<Win>) => void; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <section
      role="dialog"
      aria-label={win.app.title}
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return
        if (win.anim === 'close') onClose()
        else onChange(win.anim === 'min' ? { min: true, anim: undefined } : { anim: undefined })
      }}
      className={cn('fixed inset-0 flex flex-col bg-canvas', win.min && 'hidden', win.anim && `os-${win.anim}`)}
      style={{ zIndex: win.z }}
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-card px-2">
        <button type="button" onClick={() => onChange({ anim: 'min' })} className="inline-flex h-10 cursor-pointer items-center gap-0.5 rounded-full pr-3 pl-1 text-sm font-medium text-accent-text">
          <ChevronLeft aria-hidden className="size-5" /> Beranda
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{win.app.title}</span>
        <button type="button" aria-label={`Tutup ${win.app.title}`} onClick={() => onChange({ anim: 'close' })} className="grid size-10 cursor-pointer place-items-center rounded-full text-muted hover:bg-raised">
          <X aria-hidden className="size-5" />
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        {!loaded && <p className="absolute inset-0 grid place-items-center text-sm text-muted">Membuka {win.app.title}…</p>}
        <iframe title={win.app.title} src={win.app.url} onLoad={() => setLoaded(true)} className={cn('size-full border-0', !loaded && 'opacity-0')} />
      </div>
      <button type="button" aria-label="Kembali ke layar utama" onClick={() => onChange({ anim: 'min' })} className="grid h-7 shrink-0 cursor-pointer place-items-center bg-card">
        <span className="h-1.5 w-32 rounded-full bg-fg/80" />
      </button>
    </section>
  )
}

/**
 * Satona OS on a phone: a home screen with a status bar, a summary widget, every app as an icon and a dock.
 * Apps open full screen; going home keeps them running, and the open-apps row resumes or closes them.
 */
export function PhoneOs({ apps, wins, now, roleName, waiting, approvals, onOpen, onPatch, onRemove, onSignOut }: {
  apps: readonly App[]
  wins: readonly Win[]
  now: Date
  roleName: string
  waiting: number
  approvals: number
  onOpen: (app: App) => void
  onPatch: (id: number, patch: Partial<Win>) => void
  onRemove: (id: number) => void
  onSignOut: () => void
}) {
  const [query, setQuery] = useState('')
  const shown = apps.filter((a) => a.title.toLowerCase().includes(query.trim().toLowerCase()))
  const dock = DOCK.map((id) => apps.find((a) => a.id === id)).filter((a): a is App => !!a)
  const icon = (a: App, label = true) => (
    <button type="button" onClick={() => onOpen(a)} aria-label={label ? undefined : a.title} className="flex w-full cursor-pointer flex-col items-center gap-1.5 active:scale-95">
      <span className="relative grid size-14 place-items-center rounded-2xl bg-card shadow-card">
        <a.icon aria-hidden className="size-6 text-fg" />
        {a.id === 'approvals' && approvals > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-5 rounded-full bg-accent px-1.5 text-center text-[11px] leading-5 font-bold text-white tabular">{approvals > 99 ? '99+' : approvals}</span>}
        {wins.some((w) => w.app.id === a.id) && <span aria-hidden className="absolute -bottom-2 size-1.5 rounded-full bg-accent" />}
      </span>
      {label && <span className="line-clamp-2 text-center text-[11px] leading-tight font-medium">{a.title}</span>}
    </button>
  )

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-canvas bg-[radial-gradient(var(--color-line-strong)_1px,transparent_1px)] [background-size:22px_22px]">
      <h1 className="sr-only">Satona OS</h1>
      <div className="flex h-10 shrink-0 items-center gap-2 px-6 text-sm">
        <span className="font-semibold tabular">{now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
        <BrandMark className="mx-auto size-6" />
        <span className="inline-flex items-center gap-1 font-medium">
          <Bell aria-hidden className="size-4" />
          <span className="tabular">{waiting}</span>
          <span className="sr-only">hal menunggu</span>
        </span>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pt-2 pb-36">
        <section className="os-icon-in rounded-card bg-invert p-5 text-on-invert shadow-card">
          <p className="text-sm opacity-70">{now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{waiting} hal menunggu Anda.</p>
          <p className="mt-1 truncate text-sm opacity-70">{roleName}</p>
        </section>

        <div className="flex items-center gap-2">
          <ViewSwitch current="os" className="min-w-0 flex-1" />
          <button type="button" onClick={onSignOut} aria-label="Keluar" title="Keluar" className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full border border-line-strong bg-card text-accent-text hover:bg-accent-soft">
            <LogOut aria-hidden className="size-4" />
          </button>
        </div>

        {wins.length > 0 && (
          <section aria-label="Aplikasi terbuka">
            <p className="mb-2 eyebrow">Aplikasi terbuka</p>
            <ul className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
              {wins.map((w) => (
                <li key={w.id} className="flex shrink-0 items-center rounded-full bg-card shadow-card">
                  <button type="button" onClick={() => onOpen(w.app)} className="inline-flex h-10 cursor-pointer items-center gap-2 pr-1 pl-3 text-sm font-medium">
                    <w.app.icon aria-hidden className="size-4" /> {w.app.title}
                  </button>
                  <button type="button" aria-label={`Tutup ${w.app.title}`} onClick={() => onRemove(w.id)} className="grid size-10 cursor-pointer place-items-center rounded-full text-muted">
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <label className="flex h-11 items-center gap-2 rounded-full border border-line bg-card px-4">
          <Search aria-hidden className="size-4 text-subtle" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari aplikasi" aria-label="Cari aplikasi" className="min-w-0 flex-1 bg-transparent text-base outline-none" />
        </label>

        <ul aria-label="Semua aplikasi" className="grid grid-cols-4 gap-x-3 gap-y-5">
          {shown.map((a, i) => (
            <li key={a.id} className="os-icon-in" style={{ animationDelay: `${Math.min(i, 16) * 25}ms` }}>
              {icon(a)}
            </li>
          ))}
          {shown.length === 0 && <li className="col-span-4 py-6 text-center text-sm text-muted">Tidak ada aplikasi "{query}".</li>}
        </ul>
      </div>

      <nav aria-label="Dock" className="fixed inset-x-4 bottom-4 z-[5] rounded-[28px] border border-line bg-card/85 p-3 shadow-float backdrop-blur">
        <ul className="grid grid-cols-4 gap-3">
          {dock.map((a) => (
            <li key={a.id}>{icon(a, false)}</li>
          ))}
        </ul>
      </nav>

      {wins.map((w) => (
        <PhoneApp key={w.id} win={w} onChange={(p) => onPatch(w.id, p)} onClose={() => onRemove(w.id)} />
      ))}
    </div>
  )
}
