import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { Activity, ArrowDown, ArrowRight, Cpu, Gauge, Play, Radio } from 'lucide-react'
import { RECORD_TYPES } from '@/domain/catalog'
import { MENU_GROUPS } from '@/domain/menu'
import { moduleLabel } from '@/domain/uiLabels'
import { APP_NAME } from '@/lib/brand'
import { cn } from '@/lib/cn'
import { useSession } from '../../hooks/useSession'
import { prefersReducedMotion } from '../../ui/animate'
import { moduleIcon } from '../../ui/moduleIcons'
import { GROUP_COPY } from './content'
import { Reveal } from './SiteLayout'

/** Free Mixkit clip (no attribution required), streamed from their CDN; the dark gradient shows while it loads. */
const HERO_VIDEO = 'https://assets.mixkit.co/videos/47257/47257-720.mp4'

const FEATURES = [
  { icon: Radio, title: 'SCADA dan 3D lantai produksi', body: 'Mimik proses dengan tag langsung, alarm yang bisa diakui dan tampilan 3D tiap lini.' },
  { icon: Activity, title: 'Perawatan prediktif', body: 'Tren getaran memproyeksikan hari mesin mencapai batas alarm, sebelum mesin berhenti.' },
  { icon: Gauge, title: 'Monitoring sistem', body: 'Kesehatan API, broker, integrasi, sumber OT dan perangkat dalam satu status.' },
]

// A fixed week of output per line: the darker the cell, the closer the line ran to plan.
const MATRIX = [
  [3, 2, 3, 1, 3, 2, 0],
  [2, 3, 3, 3, 1, 3, 2],
  [1, 2, 0, 3, 3, 2, 3],
  [3, 3, 2, 2, 3, 1, 3],
  [2, 1, 3, 3, 2, 3, 3],
]
const CELL = ['bg-control', 'bg-line-strong', 'bg-accent/60', 'bg-accent']
const OEE = [62, 66, 64, 71, 69, 74, 72, 78, 76, 81]

function HeroVideo() {
  const video = useRef<HTMLVideoElement>(null)
  // People who ask for less motion get the still gradient instead of a moving background.
  useEffect(() => {
    if (prefersReducedMotion()) video.current?.pause()
  }, [])
  return (
    <video ref={video} className="absolute inset-0 size-full object-cover" src={HERO_VIDEO} autoPlay muted loop playsInline preload="metadata" aria-hidden />
  )
}

function Hotspot({ className }: { className: string }) {
  return (
    <span aria-hidden className={cn('absolute grid size-12 place-items-center rounded-full bg-card/70 shadow-card backdrop-blur', className)}>
      <span className="grid size-6 place-items-center rounded-full bg-card">
        <span className="size-2 rounded-full bg-accent" />
      </span>
    </span>
  )
}

/**
 * Public landing page for WIT Manufacturing Platform, after the Quark and Dexxy references: a full-screen factory video
 * under an ink gradient, a pill nav, a large headline with one red word, hotspot captions and live demo cards, then the
 * platform numbers, the six function groups, the product highlights and a red call to action. WIT colours throughout.
 */
export default function LandingPage() {
  const { signedIn } = useSession()
  const enter = signedIn ? '/dashboard' : '/login'
  const enterLabel = signedIn ? 'Buka dashboard' : 'Coba demo'
  const moduleIds = MENU_GROUPS.flatMap(([, , ids]) => ids)
  const stats = [
    [String(moduleIds.length), 'modul siap pakai'],
    [String(RECORD_TYPES.length), 'jenis data dan alur kerja'],
    ['6', 'kelompok solusi dalam satu menu'],
    ['99,94%', 'uptime 30 hari'],
  ]

  return (
    <>
      <section className="relative isolate flex min-h-dvh flex-col overflow-hidden pt-20">
        <div className="absolute inset-0 -z-10 bg-canvas">
          <HeroVideo />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,var(--color-canvas)_0%,color-mix(in_srgb,var(--color-canvas)_88%,transparent)_38%,color-mix(in_srgb,var(--color-canvas)_40%,transparent)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-canvas to-transparent" />
        </div>


        <div className="relative flex flex-1 flex-col justify-center px-5 py-16 sm:px-8 lg:px-12">
          <p className="hero-rise mb-5 inline-flex w-fit items-center gap-2 rounded-full bg-control px-3 py-1.5 text-xs font-medium backdrop-blur">
            <span className="size-2 animate-pulse rounded-full bg-accent" /> Pabrik terhubung, data langsung
          </p>
          <h1 className="hero-rise max-w-3xl [--d:100ms] text-[44px] leading-[1.02] font-semibold tracking-tight sm:text-6xl lg:text-7xl">
            Satu platform untuk seluruh <span className="text-accent">pabrik</span> Anda.
          </h1>
          <p className="hero-rise mt-6 max-w-xl text-base text-muted [--d:200ms] sm:text-lg">
            {APP_NAME} menghubungkan mesin, sensor dan PLC dengan data produksi, perawatan, rantai pasok dan keuangan. Pantau output secara langsung dan ambil keputusan dari satu layar.
          </p>
          <div className="hero-rise mt-8 flex flex-wrap gap-3 [--d:300ms]">
            <Link to={enter} className="inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 font-semibold text-white shadow-glow transition-transform active:scale-[0.97]">
              {enterLabel} <ArrowRight aria-hidden className="size-4" />
            </Link>
            <Link to="/platform" className="inline-flex h-12 items-center gap-2 rounded-full border border-line-strong bg-card/70 px-6 font-medium text-fg backdrop-blur hover:bg-card">
              <Play aria-hidden className="size-4" /> Lihat cara kerja
            </Link>
          </div>

          <div className="pointer-events-none absolute top-16 right-12 hidden w-72 xl:block">
            <Hotspot className="-left-24 -top-3" />
            <span aria-hidden className="absolute top-3 -left-12 h-px w-10 bg-line-strong" />
            <p className="rounded-2xl border border-line bg-card/85 p-4 text-sm text-muted backdrop-blur-md">
              <span className="font-semibold text-fg">WIT</span> menyinkronkan perangkat pabrik ke satu pusat kontrol untuk <span className="text-fg">melacak output</span> dan <span className="text-fg">memvisualkan data produksi</span> secara langsung.
            </p>
          </div>
          <Hotspot className="top-1/2 left-[58%] hidden lg:grid" />

          <div className="hero-rise absolute right-12 bottom-24 hidden w-[520px] grid-cols-2 gap-3 [--d:450ms] lg:grid" aria-label="Pratinjau demo langsung">
            <p className="col-span-2 flex items-center gap-2 text-lg font-semibold">
              Demo langsung <span className="ml-auto size-2 animate-pulse rounded-full bg-accent" />
            </p>
            <div className="rounded-2xl border border-line bg-card/85 p-4 backdrop-blur-md">
              <p className="text-xs text-muted">Matriks output, minggu ini</p>
              <div className="mt-3 grid grid-cols-7 gap-1">
                {MATRIX.flat().map((v, i) => (
                  <span key={i} className={cn('aspect-square rounded-[3px]', CELL[v])} />
                ))}
              </div>
              <p className="mt-2 flex justify-between text-[10px] text-muted">
                <span>Sen</span>
                <span>Min</span>
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-card/85 p-4 backdrop-blur-md">
              <p className="text-xs text-muted">OEE lini granulasi</p>
              <p className="mt-1 text-2xl font-semibold tabular">81%</p>
              <svg viewBox="0 0 100 40" className="mt-2 h-14 w-full" aria-hidden>
                <defs>
                  <linearGradient id="oee-wash" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.45" />
                    <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={`M0 40 ${OEE.map((v, i) => `L${(i / (OEE.length - 1)) * 100} ${40 - (v - 55) * 1.3}`).join(' ')} L100 40 Z`} fill="url(#oee-wash)" />
                <path d={OEE.map((v, i) => `${i ? 'L' : 'M'}${(i / (OEE.length - 1)) * 100} ${40 - (v - 55) * 1.3}`).join(' ')} fill="none" stroke="var(--color-accent)" strokeWidth="1.6" />
              </svg>
            </div>
          </div>

          <a href="#platform" className="absolute bottom-8 left-5 hidden flex-col items-center gap-3 text-[11px] tracking-[0.3em] text-muted uppercase sm:left-8 sm:flex lg:left-12">
            <span className="[writing-mode:vertical-rl] rotate-180">Gulir</span>
            <ArrowDown aria-hidden className="size-4 animate-bounce" />
          </a>
        </div>
      </section>

      <section id="platform" className="relative overflow-hidden border-t border-line px-5 py-20 sm:px-8 lg:px-12">
        <p aria-hidden className="pointer-events-none text-[18vw] leading-none font-bold tracking-tighter text-transparent select-none [-webkit-text-stroke:1px_var(--color-line-strong)]">
          MANUFACTURING
        </p>
        <div className="-mt-[6vw] grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map(([value, label], i) => (
            <Reveal key={label} delay={i * 90} className="rounded-2xl border border-line bg-raised p-6 backdrop-blur">
              <p className="text-4xl font-semibold tracking-tight tabular">{value}</p>
              <p className="mt-1 text-sm text-muted">{label}</p>
            </Reveal>
          ))}
        </div>
        <div className="mt-14 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
          <ul aria-label="Modul platform" className="marquee flex w-max gap-3">
            {[...moduleIds, ...moduleIds].map((id, i) => {
              const Icon = moduleIcon(id)
              return (
                <li key={`${id}-${i}`} aria-hidden={i >= moduleIds.length || undefined} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-raised px-4 py-2.5 text-sm">
                  <Icon aria-hidden className="size-4 text-accent" /> {moduleLabel(id)}
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      <section id="modul" className="px-5 py-20 sm:px-8 lg:px-12">
        <Reveal className="flex flex-wrap items-end gap-4">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">
            Semua fungsi pabrik dalam satu menu<span className="text-accent">.</span>
          </h2>
          <p className="max-w-sm text-muted sm:ml-auto">Enam kelompok, satu data. Setiap modul punya CRUD lengkap, persetujuan bertingkat dan tampilan tabel, papan, kalender, Gantt, peta dan 3D.</p>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {MENU_GROUPS.map(([id, label, ids], i) => {
            const g = GROUP_COPY[id]!
            return (
              <Reveal key={id} as="article" delay={(i % 3) * 90}>
                <Link to={`/solutions/${id}`} className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-card shadow-card p-6 transition-[background-color,border-color,translate] duration-300 hover:-translate-y-1 hover:border-accent/60 hover:bg-card">
                  <span className="grid size-12 place-items-center rounded-2xl bg-control transition-colors group-hover:bg-accent">
                    <g.icon aria-hidden className="size-6" />
                  </span>
                  <h3 className="mt-6 text-xl font-semibold">{label}</h3>
                  <p className="mt-2 text-sm text-muted">{g.body}</p>
                  <p className="mt-auto flex items-center gap-2 pt-6 text-xs font-medium tracking-wide text-muted uppercase">
                    {ids.length} modul <ArrowRight aria-hidden className="size-3.5 text-accent transition-transform group-hover:translate-x-1" />
                  </p>
                </Link>
              </Reveal>
            )
          })}
        </div>
      </section>

      <section id="produk" className="grid items-center gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:px-12">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">
            Dari lantai produksi ke ruang direksi<span className="text-accent">.</span>
          </h2>
          <ul className="mt-8 space-y-6">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent">
                  <f.icon aria-hidden className="size-5 text-white" />
                </span>
                <span>
                  <span className="block font-semibold">{f.title}</span>
                  <span className="mt-1 block text-sm text-muted">{f.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={120} className="rounded-3xl border border-line bg-card shadow-card p-4 shadow-float">
        <div aria-label="Pratinjau dashboard">
          <div className="flex items-center gap-2 border-b border-line pb-3">
            <span className="size-2.5 rounded-full bg-accent" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="size-2.5 rounded-full bg-line-strong" />
            <span className="ml-3 text-xs text-muted">SCADA pabrik · Lini A</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {['Mixer', 'Granulator', 'Dryer', 'Cooler', 'Screen', 'Bagging'].map((name, i) => (
              <div key={name} className={cn('rounded-xl border p-3', i === 2 ? 'border-accent bg-accent/10' : 'border-line bg-raised')}>
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className={cn('size-2 rounded-full', i === 2 ? 'animate-pulse bg-accent' : 'bg-success')} /> {name}
                </span>
                <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-control">
                  <span className={cn('block h-full rounded-full', i === 2 ? 'bg-accent' : 'bg-info')} style={{ width: `${[64, 72, 104, 58, 47, 69][i]}%` }} />
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[['OEE', '81%'], ['Alarm', '2'], ['Online', '94%']].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-raised py-3">
                <p className="text-lg font-semibold tabular">{v}</p>
                <p className="text-[11px] text-muted">{k}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Cpu aria-hidden className="size-3.5" /> Dryer A-3 di atas batas suhu burner. Satu klik membuat permintaan perawatan.
          </p>
        </div>
        </Reveal>
      </section>

      <section id="mulai" className="px-5 pb-20 sm:px-8 lg:px-12">
        <Reveal className="flex flex-wrap items-center gap-6 rounded-3xl bg-accent p-8 text-white shadow-glow sm:p-12">
          <div className="max-w-xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Lihat pabrik Anda di satu layar.</h2>
            <p className="mt-2 text-white/80">Masuk ke demo dengan satu klik dan pilih peran: direktur, kepala perawatan, operator atau sopir.</p>
          </div>
          <Link to={enter} className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 font-semibold text-white transition-transform active:scale-[0.97] sm:ml-auto">
            {enterLabel} <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Reveal>
      </section>
    </>
  )
}
