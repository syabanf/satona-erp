import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { Bell, Search } from 'lucide-react'
import type { Alert } from '@/domain/ops'
import { homeFor } from '@/domain/menu'
import { cn } from '@/lib/cn'
import { shortDay, shortWeekday } from '@/lib/dates'
import { useAlerts } from '../hooks/useAlerts'
import { useMenu, useTrail } from '../hooks/useMenu'
import { useAccess } from '../hooks/useRecords'
import { useSession } from '../hooks/useSession'
import { useServices } from '../hooks/useServices'
import { Dot } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Entrance } from '../ui/Motion'
import { menuItem, Popover } from '../ui/Popover'
import { RecordDrawerProvider } from '../records/RecordDrawer'
import { TourProvider } from '../tour/TourProvider'
import { CommandPalette } from './dashboard/CommandPalette'
import { BottomNav } from './dashboard/BottomNav'
import { TaskLauncher } from './dashboard/TaskLauncher'
import { CommandCenter } from '../features/overview/CommandCenter'
import { usePalette } from './dashboard/palette'
import { Sidebar, SidebarContent } from './dashboard/Sidebar'

const COLLAPSE_KEY = 'satona-sidebar'

/** Stored choice first; without one the sidebar starts open from 1280 px and collapsed below. */
function initialCollapsed() {
  try {
    const saved = localStorage.getItem(COLLAPSE_KEY)
    if (saved) return saved === 'collapsed'
  } catch {
    // Storage blocked: fall back to the width rule.
  }
  return window.innerWidth < 1280
}

function Notifications({ alerts }: { alerts: readonly Alert[] }) {
  const urgent = alerts.filter((a) => a.tone === 'danger').length
  return (
    <Popover
      width="w-80"
      trigger={(props) => (
        <Button {...props} data-tour="alerts" variant="card" size="icon-lg" aria-label={`Alerts, ${alerts.length} open`} className="relative">
          <Bell aria-hidden className="size-5" />
          {urgent > 0 && <Dot tone="accent" className="absolute top-3 right-3.5 ring-2 ring-card" />}
        </Button>
      )}
    >
      {(close) => (
        <div className="max-h-[70dvh] overflow-y-auto">
          <p className="px-3 pt-1 pb-2 eyebrow">Perlu ditangani</p>
          {alerts.length === 0 && <p className="px-3 pb-2 text-sm text-body">Belum ada masalah yang perlu ditangani.</p>}
          {alerts.map((a) => (
            <Link key={a.id} to={a.to} onClick={close} className={`${menuItem} items-start`}>
              <Dot tone={a.tone === 'danger' ? 'accent' : a.tone} className="mt-1.5" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-fg">{a.title}</span>
                <span className="block text-xs text-muted">{a.detail}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </Popover>
  )
}

/** Title words sit in masks so the entrance can raise them; the red period follows the last one. */
function Title({ text }: { text: string }) {
  return (
    <h1 className="text-2xl font-bold leading-tight tracking-tight md:text-[28px]">
      {text.split(' ').map((word, i) => (
        <span key={`${word}-${i}`} className="-mb-[0.1em] inline-block overflow-hidden pb-[0.1em] align-bottom">
          <span data-word className="inline-block">
            {word}
            {i < text.split(' ').length - 1 && '\u00a0'}
          </span>
        </span>
      ))}
      <span className="text-accent">.</span>
    </h1>
  )
}

/** Breadcrumb over the page title, the date, and the bell. Phones get the menu button. */
function Header({ alerts }: { alerts: readonly Alert[] }) {
  const { pathname } = useLocation()
  const { clock } = useServices()
  const crumbs = useTrail()
  const { tree } = useMenu()
  const openSearch = usePalette()
  const today = clock.today()
  const leaf = crumbs.at(-1)
  const folders = crumbs.slice(0, -1)
  const detail = leaf?.to ? pathname !== leaf.to.split('?')[0] : false
  const short = (label: string) => label.split(' · ')[0] ?? label

  return (
    <header className="flex shrink-0 items-center gap-3 px-4 pt-4 pb-4 md:px-6 lg:px-8 lg:pt-6">
      <div className="min-w-0 flex-1">
        {leaf && (
          <nav aria-label="Breadcrumb">
            <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs whitespace-nowrap text-muted">
              {folders.map((f, i) => (
                <li key={f.id} className={cn('items-center gap-1.5', i < folders.length - 1 ? 'hidden lg:flex' : 'flex')}>
                  <span className="truncate">{short(f.label)}</span>
                  <span aria-hidden>/</span>
                </li>
              ))}
              <li className="truncate">
                {detail && leaf.to ? (
                  <Link to={leaf.to} className="hover:text-fg hover:underline">
                    {leaf.label}
                  </Link>
                ) : (
                  <span aria-current="page">{leaf.label}</span>
                )}
              </li>
              {detail && (
                <>
                  <li aria-hidden>/</li>
                  <li aria-current="page">Rincian</li>
                </>
              )}
            </ol>
          </nav>
        )}
        <Title text={leaf?.label ?? (tree.length ? 'Halaman tidak ditemukan' : 'Memuat halaman')} />
        <p className="mt-0.5 text-[11px] text-muted">Data demo · perubahan hanya di perangkat ini</p>
      </div>
      {leaf?.tcode && (
        <span title="Transaction code" className="tcode hidden h-10 items-center rounded-full border border-line bg-card px-3 font-mono text-xs font-semibold text-accent-text shadow-card md:inline-flex">
          {leaf.tcode}
        </span>
      )}
      <span className="hidden h-10 items-center rounded-full border border-line bg-card px-4 text-xs font-medium text-muted shadow-card lg:inline-flex">
        {shortWeekday(today)}, {shortDay(today)}
      </span>
      <Button variant="card" size="icon-lg" aria-label="Cari pekerjaan atau data" onClick={() => openSearch()}>
        <Search aria-hidden className="size-5" />
      </Button>
      <Notifications alerts={alerts} />
    </header>
  )
}

/**
 * Desktop console: an attached white sidebar (collapsible to icons), a breadcrumb header and a
 * scrolling `main`. Phones open the same sidebar as a drawer from the menu button.
 */
export function DashboardShell() {
  const { pathname } = useLocation()
  const alerts = useAlerts()
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [drawer, setDrawer] = useState(false)
  const main = useRef<HTMLElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const { signedIn, role } = useSession()
  const accessFor = useAccess()
  const { tree, approvals } = useMenu()

  // Block body on purpose: newer browsers return a Promise from scrollTo, and an effect may only return a cleanup.
  useEffect(() => {
    main.current?.scrollTo({ top: 0 })
  }, [pathname])

  useEffect(() => {
    if (!drawer) return
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeDrawer()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])

  function closeDrawer() {
    setDrawer(false)
  }

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? 'open' : 'collapsed')
      } catch {
        // Storage blocked: the choice lasts for this page only.
      }
      return !c
    })
  }

  if (!signedIn) return <Navigate to="/login" replace />
  // Inside an OS-view window the page stands alone: the window frame replaces the sidebar and bottom nav.
  const embedded = window.self !== window.top

  return (
    <RecordDrawerProvider>
      <TourProvider>
        <CommandPalette>
          <div className="flex h-dvh bg-canvas">
            <a
              href="#main"
              className="sr-only z-50 rounded-full bg-invert px-4 py-2 text-on-invert focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
            >
              Skip to content
            </a>
            {!embedded && <Sidebar collapsed={collapsed} onToggle={toggle} />}
            <div className="flex min-w-0 flex-1 flex-col">
              <Header alerts={alerts} />
              <main id="main" ref={main} tabIndex={-1} className={cn('min-h-0 flex-1 overflow-y-auto px-4 outline-none md:px-6 lg:px-8', embedded ? 'pb-6' : 'pb-28 md:pb-8')}>
                <Entrance key={pathname}>
                  {tree.length > 0 && pathname === homeFor(role) && !role.external && (
                    <>
                      <CommandCenter role={role} />
                      <TaskLauncher role={role} accessFor={accessFor} approvals={approvals} />
                    </>
                  )}
                  <Outlet />
                </Entrance>
              </main>
            </div>
            {!embedded && <BottomNav role={role} access={accessFor(role.module)} approvals={approvals} menuOpen={drawer} onMenu={() => setDrawer((d) => !d)} />}
            {drawer && (
              <div role="dialog" aria-modal="true" aria-label="Menu" className="fixed inset-0 z-30 md:hidden">
                <button type="button" aria-label="Close menu" className="absolute inset-0 animate-fade bg-ink/40" onClick={closeDrawer} />
                <div ref={panel} tabIndex={-1} className="absolute inset-x-0 top-6 bottom-0 flex animate-slide-up flex-col overflow-hidden rounded-t-[28px] bg-card pb-24 shadow-float outline-none">
                  <span aria-hidden className="mx-auto mt-2.5 mb-1 block h-1.5 w-10 shrink-0 rounded-full bg-line-strong" />
                  <div className="min-h-0 flex-1">
                    <SidebarContent collapsed={false} onNavigate={() => setDrawer(false)} onClose={closeDrawer} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </CommandPalette>
      </TourProvider>
    </RecordDrawerProvider>
  )
}
