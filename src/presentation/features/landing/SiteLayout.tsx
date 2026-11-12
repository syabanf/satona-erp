import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Menu, X } from 'lucide-react'
import { MENU_GROUPS } from '@/domain/menu'
import { APP_NAME, APP_PRODUCT } from '@/lib/brand'
import { cn } from '@/lib/cn'
import { useSession } from '../../hooks/useSession'
import { BrandMark } from '../../ui/BrandMark'
import { ThemeToggle } from '../../ui/ThemeToggle'

const PAGES = [
  { to: '/', label: 'Beranda', end: true },
  { to: '/platform', label: 'Platform', end: false },
  { to: '/solutions', label: 'Solusi', end: false },
  { to: '/about', label: 'Tentang', end: false },
  { to: '/contact', label: 'Kontak', end: false },
]

/** Fades its children up when they scroll into view; `delay` in ms staggers siblings. Without motion they simply show. */
export function Reveal({ children, delay = 0, className, as: Tag = 'div' }: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'li' | 'section' | 'article' }) {
  const ref = useRef<HTMLElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        setShown(true)
        io.disconnect()
      }
    }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <Tag ref={ref as never} data-in={shown || undefined} className={cn('reveal', className)} style={{ '--d': `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  )
}

/** The top of an inner page: eyebrow, a title ending in the red period, and a lead paragraph over an ink glow. */
export function PageHero({ eyebrow, title, body, icon: Icon, children }: { eyebrow: string; title: string; body: string; icon?: React.ComponentType<{ className?: string }>; children?: ReactNode }) {
  return (
    <section className="site-grid relative overflow-hidden px-5 pt-36 pb-20 sm:px-8 lg:px-12">
      <div aria-hidden className="site-glow absolute -top-40 right-0 size-[560px] rounded-full bg-accent/25 blur-3xl" />
      <div className="relative max-w-3xl">
        <p className="hero-rise mb-5 inline-flex items-center gap-2 rounded-full bg-control px-3 py-1.5 text-xs font-medium tracking-wide uppercase">
          {Icon && <Icon className="size-4 text-accent" />} {eyebrow}
        </p>
        <h1 className="hero-rise text-4xl leading-[1.05] font-semibold tracking-tight [--d:80ms] sm:text-6xl">
          {title}
          <span className="text-accent">.</span>
        </h1>
        <p className="hero-rise mt-6 max-w-2xl text-base text-muted [--d:160ms] sm:text-lg">{body}</p>
        {children && <div className="hero-rise mt-8 [--d:240ms]">{children}</div>}
      </div>
    </section>
  )
}

/**
 * The public site around every marketing page: a fixed header that turns solid once the page scrolls (or right away on
 * inner pages), a phone menu, and a footer with every solution group. Each route change starts at the top.
 */
export default function SiteLayout() {
  const { pathname } = useLocation()
  const { signedIn } = useSession()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const home = pathname === '/'
  const enter = signedIn ? '/dashboard' : '/login'

  useEffect(() => {
    window.scrollTo(0, 0)
    setOpen(false)
  }, [pathname])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const solid = scrolled || !home || open

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <header className={cn('fixed inset-x-0 top-0 z-50 transition-colors duration-300', solid && 'border-b border-line bg-canvas/85 backdrop-blur-lg')}>
        <div className="flex items-center gap-3 px-5 py-4 sm:px-8 lg:px-12">
          <Link to="/" className="flex items-center gap-2.5" aria-label={`${APP_NAME}, beranda`}>
            <BrandMark className="h-5" />
            <span className="hidden text-sm font-semibold sm:inline">{APP_PRODUCT}</span>
          </Link>
          <nav aria-label="Halaman" className="mx-auto hidden items-center gap-1 rounded-full bg-control p-1 backdrop-blur lg:flex">
            {PAGES.map((p) => (
              <NavLink key={p.to} to={p.to} end={p.end} className={({ isActive }) => cn('rounded-full px-4 py-2 text-sm font-medium transition-colors', isActive ? 'bg-invert text-on-invert' : 'text-muted hover:text-fg')}>
                {p.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <ThemeToggle variant="ghost" size="icon" />
            {!signedIn && (
              <Link to="/login" className="hidden rounded-full px-4 py-2.5 text-sm font-medium text-muted hover:text-fg sm:inline-flex">
                Masuk
              </Link>
            )}
            <Link to={enter} className="inline-flex items-center rounded-full bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform active:scale-[0.97]">
              {signedIn ? 'Buka dashboard' : 'Coba demo'}
            </Link>
            <button type="button" aria-label={open ? 'Tutup menu' : 'Buka menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid size-10 cursor-pointer place-items-center rounded-full bg-control lg:hidden">
              {open ? <X aria-hidden className="size-5" /> : <Menu aria-hidden className="size-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav aria-label="Halaman" className="animate-rise border-t border-line px-5 pb-5 lg:hidden">
            {PAGES.map((p) => (
              <NavLink key={p.to} to={p.to} end={p.end} className={({ isActive }) => cn('block border-b border-line py-3.5 text-lg font-medium', isActive ? 'text-accent' : 'text-fg')}>
                {p.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="border-t border-line px-5 py-14 sm:px-8 lg:px-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <BrandMark className="h-7" />
            <p className="mt-4 max-w-sm text-sm text-muted">{APP_NAME} menyatukan produksi, perawatan, rantai pasok, keuangan dan SDM pabrik dalam satu platform.</p>
          </div>
          <div>
            <p className="eyebrow">Solusi</p>
            <ul className="mt-3 space-y-2 text-sm">
              {MENU_GROUPS.map(([id, label]) => (
                <li key={id}>
                  <Link to={`/solutions/${id}`} className="text-muted hover:text-fg">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="eyebrow">Perusahaan</p>
            <ul className="mt-3 space-y-2 text-sm">
              {PAGES.slice(1).map((p) => (
                <li key={p.to}>
                  <Link to={p.to} className="text-muted hover:text-fg">
                    {p.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-12 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-6 text-xs text-muted">
          <span>© 2026 WIT.id</span>
          <span>360° Digital Transformation Culture Company</span>
          <span className="sm:ml-auto">Video latar dari Mixkit</span>
        </p>
      </footer>
    </div>
  )
}
