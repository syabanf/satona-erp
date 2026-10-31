import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { Check, Clock, Compass, Keyboard, X } from 'lucide-react'
import { ALL_TUTORIALS, QUICK_TOUR, stepPath, TUTORIALS, type Tutorial } from '@/domain/tutorials'
import { cn } from '@/lib/cn'
import { useSession } from '../hooks/useSession'
import { Button } from '../ui/Button'
import { useToast } from '../ui/useToast'
import { markDone, readDone, TourContext } from './context'

const PAD = 6
const CARD = 340

/** The first visible element carrying `data-tour="<target>"` (the sidebar renders twice: panel and phone drawer). */
const findTarget = (target: string) =>
  [...document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)].find((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  })

interface Box {
  left: number
  top: number
  width: number
  height: number
}

/** The highlighted area: the target plus padding, clipped to the viewport so a tall table still shows its frame. */
function holeOf(rect: DOMRect): Box {
  const left = Math.max(4, rect.left - PAD)
  const top = Math.max(4, rect.top - PAD)
  return { left, top, width: Math.min(window.innerWidth - 4, rect.right + PAD) - left, height: Math.min(window.innerHeight - 4, rect.bottom + PAD) - top }
}

/** Below the hole when it fits, else above, else the bottom-right corner. Phones pin the card to the bottom. */
function cardStyle(hole: Box | null): CSSProperties | undefined {
  if (!hole || window.innerWidth < 640) return undefined
  const left = Math.min(Math.max(16, hole.left), window.innerWidth - CARD - 16)
  const room = 230
  if (hole.top + hole.height + 12 + room < window.innerHeight) return { left, top: hole.top + hole.height + 12, width: CARD }
  if (hole.top - 12 - room > 0) return { left, bottom: window.innerHeight - hole.top + 12, width: CARD }
  return { right: 24, bottom: 24, width: CARD }
}

function Spotlight({ tutorial, onClose, onFinish }: { tutorial: Tutorial; onClose: () => void; onFinish: () => void }) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const { role } = useSession()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const card = useRef<HTMLDivElement>(null)
  const step = tutorial.steps[index]!
  const last = index === tutorial.steps.length - 1
  const next = useCallback(() => (last ? onFinish() : setIndex((i) => i + 1)), [last, onFinish])
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  // A step that belongs to another page takes the user there first.
  useEffect(() => {
    const path = stepPath(step.route, role)
    if (path && path !== pathname) navigate(path)
  }, [step, role, navigate, pathname])

  // Pages load lazily, so look for the target for about a second before falling back to a centred card.
  useLayoutEffect(() => {
    setRect(null)
    if (!step.target) return
    let frame = 0
    let tries = 0
    let el: HTMLElement | undefined
    const measure = () => el && setRect(el.getBoundingClientRect())
    const look = () => {
      el = findTarget(step.target!)
      if (el) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        measure()
      } else if (tries++ < 60) frame = requestAnimationFrame(look)
    }
    look()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step, pathname])

  useEffect(() => {
    card.current?.focus()
  }, [index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') back()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, next, back])

  const hole = rect ? holeOf(rect) : null
  const style = cardStyle(hole)
  const shade = 'absolute bg-ink/55'
  return (
    <div className="fixed inset-0 z-[950]">
      {/* Four shades around the hole dim the page and block clicks while the tour runs. */}
      {hole ? (
        <div aria-hidden>
          <div className={shade} style={{ left: 0, top: 0, right: 0, height: hole.top }} />
          <div className={shade} style={{ left: 0, top: hole.top + hole.height, right: 0, bottom: 0 }} />
          <div className={shade} style={{ left: 0, top: hole.top, width: hole.left, height: hole.height }} />
          <div className={shade} style={{ left: hole.left + hole.width, top: hole.top, right: 0, height: hole.height }} />
          <div className="absolute rounded-xl border-2 border-accent shadow-glow" style={hole} />
        </div>
      ) : (
        <div aria-hidden className="absolute inset-0 animate-fade bg-ink/55" />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        style={style}
        className={cn(
          'absolute animate-rise rounded-card border border-line bg-card p-5 shadow-float outline-none',
          style ? '' : hole ? 'inset-x-3 bottom-3' : 'top-1/2 left-1/2 w-[min(400px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2',
        )}
      >
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="font-medium text-accent-text">{tutorial.title}</span>
          <span className="tabular">
            · {index + 1} dari {tutorial.steps.length}
          </span>
          <Button size="icon-sm" variant="ghost" aria-label="Tutup tur" className="ml-auto" onClick={onClose}>
            <X aria-hidden className="size-4" />
          </Button>
        </div>
        <h2 id="tour-title" className="mt-1 text-lg font-semibold">
          {step.title}
        </h2>
        <p id="tour-body" aria-live="polite" className="mt-1.5 text-sm text-body">
          {step.body}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <span aria-hidden className="flex flex-1 gap-1">
            {tutorial.steps.map((s, i) => (
              <span key={s.title} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-accent' : 'w-1.5 bg-control')} />
            ))}
          </span>
          {index > 0 && (
            <Button variant="ghost" size="sm" onClick={back}>
              Kembali
            </Button>
          )}
          <Button variant="accent" size="sm" onClick={next}>
            {last ? 'Selesai' : 'Lanjut'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function HelpCenter({ onClose, onStart }: { onClose: () => void; onStart: (id: string) => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const done = useMemo(() => readDone(), [])

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

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="help-title" className="fixed inset-0 z-[900] grid place-items-center p-3 sm:p-6">
      <button type="button" aria-label="Tutup" className="absolute inset-0 animate-fade bg-ink/40" onClick={onClose} />
      <div ref={panel} tabIndex={-1} className="relative flex max-h-[92dvh] w-full max-w-2xl animate-rise flex-col overflow-hidden rounded-card bg-card shadow-float outline-none">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="help-title" className="text-lg font-semibold">
              Tutorial penggunaan<span className="text-accent">.</span>
            </h2>
            <p className="text-sm text-muted">Mulai dari tur singkat, lalu pilih panduan sesuai pekerjaan Anda.</p>
          </div>
          <Button size="icon-sm" variant="ghost" aria-label="Tutup" onClick={onClose}>
            <X aria-hidden className="size-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <button type="button" onClick={() => onStart(QUICK_TOUR.id)} className="flex w-full cursor-pointer items-center gap-4 rounded-panel bg-invert p-4 text-left text-on-invert transition-transform active:scale-[0.98]">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent text-white shadow-glow">
              <Compass aria-hidden className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{QUICK_TOUR.title}</span>
              <span className="block text-sm opacity-70">{QUICK_TOUR.summary}</span>
            </span>
            <span className="text-xs opacity-70 tabular">{QUICK_TOUR.steps.length} langkah</span>
          </button>

          <div>
            <p className="mb-2 eyebrow">Panduan langkah demi langkah</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {TUTORIALS.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => onStart(t.id)} className="flex h-full w-full cursor-pointer flex-col rounded-panel border border-line bg-raised p-4 text-left transition-colors hover:border-accent hover:bg-accent-soft">
                    <span className="flex items-center gap-2 font-semibold">
                      {t.title}
                      {done.has(t.id) && <Check aria-label="Sudah selesai" className="size-4 text-success" />}
                    </span>
                    <span className="mt-1 text-sm text-muted">{t.summary}</span>
                    <span className="mt-auto flex items-center gap-1 pt-3 text-xs text-subtle">
                      <Clock aria-hidden className="size-3.5" /> {t.minutes} menit · {t.steps.length} langkah
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-panel border border-line p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Keyboard aria-hidden className="size-4 text-muted" /> Pintasan keyboard
            </p>
            <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {[
                ['⌘K atau /', 'Cari data, menu atau kode'],
                ['N', 'Data baru di halaman daftar'],
                ['Esc', 'Tutup jendela atau panel'],
                ['← →', 'Pindah langkah saat tur'],
              ].map(([key, what]) => (
                <div key={key} className="flex items-center gap-2">
                  <dt>
                    <kbd className="rounded-md border border-line-strong bg-raised px-1.5 py-0.5 font-mono text-xs">{key}</kbd>
                  </dt>
                  <dd className="text-muted">{what}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Hosts the help centre and the spotlight tour for the whole console. */
export function TourProvider({ children }: { children: ReactNode }) {
  const [help, setHelp] = useState(false)
  const [active, setActive] = useState<Tutorial | null>(null)
  const toast = useToast()
  const controls = useMemo(
    () => ({
      openHelp: () => setHelp(true),
      start: (id: string) => {
        setHelp(false)
        setActive(ALL_TUTORIALS.find((t) => t.id === id) ?? null)
      },
    }),
    [],
  )
  const close = useCallback(() => setActive(null), [])
  const finish = useCallback(() => {
    if (active) {
      markDone(active.id)
      toast({ title: `${active.title} selesai`, description: 'Buka Tutorial penggunaan kapan saja untuk panduan lain.' })
    }
    setActive(null)
  }, [active, toast])

  return (
    <TourContext.Provider value={controls}>
      {children}
      {help && <HelpCenter onClose={() => setHelp(false)} onStart={controls.start} />}
      {active && <Spotlight key={active.id} tutorial={active} onClose={close} onFinish={finish} />}
    </TourContext.Provider>
  )
}
