import { Link, useParams } from 'react-router'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { typesOf } from '@/domain/catalog'
import { MENU_GROUPS } from '@/domain/menu'
import { subModulesOf } from '@/domain/subModules'
import { moduleLabel } from '@/domain/uiLabels'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { moduleIcon } from '../../ui/moduleIcons'
import { GROUP_COPY, MODULE_COPY } from './content'
import { PageHero, Reveal } from './SiteLayout'

/** All six solution groups, each card listing its modules with their icons. */
export function SolutionsPage() {
  return (
    <>
      <PageHero eyebrow="Solusi" title="Enam kelompok, satu pabrik yang terhubung" body="Setiap kelompok menyatukan modul yang biasanya terpisah di sistem berbeda. Pilih kelompok untuk melihat setiap modul, fiturnya dan hasil yang bisa dicapai." />
      <section className="grid gap-5 px-5 pb-24 sm:px-8 md:grid-cols-2 lg:px-12 xl:grid-cols-3">
        {MENU_GROUPS.map(([id, label, modules], i) => {
          const copy = GROUP_COPY[id]!
          return (
            <Reveal key={id} as="article" delay={(i % 3) * 90}>
              <Link to={`/solutions/${id}`} className="group flex h-full flex-col rounded-3xl border border-line bg-card shadow-card p-7 transition-[background-color,border-color,translate] duration-300 hover:-translate-y-1 hover:border-accent/60 hover:bg-card">
                <span className="grid size-14 place-items-center rounded-2xl bg-accent shadow-glow">
                  <copy.icon aria-hidden className="size-7 text-white" />
                </span>
                <h2 className="mt-6 text-2xl font-semibold">{label}</h2>
                <p className="mt-2 text-sm text-muted">{copy.tagline}</p>
                <ul className="mt-6 flex flex-wrap gap-2">
                  {modules.map((m) => {
                    const Icon = moduleIcon(m)
                    return (
                      <li key={m} className="inline-flex items-center gap-1.5 rounded-full bg-control px-3 py-1.5 text-xs">
                        <Icon aria-hidden className="size-3.5" /> {moduleLabel(m)}
                      </li>
                    )
                  })}
                </ul>
                <span className="mt-auto inline-flex items-center gap-2 pt-8 text-sm font-semibold text-accent">
                  Lihat {modules.length} modul <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </Reveal>
          )
        })}
      </section>
    </>
  )
}

/** One solution group: what it does, the outcomes, then every module with its icon, explanation, features and scope. */
export function SolutionPage() {
  const { group = '' } = useParams()
  const { erp } = useServices()
  const modules = useResource('erp.modules', () => erp.modules())
  const entry = MENU_GROUPS.find(([id]) => id === group)
  const copy = GROUP_COPY[group]
  if (!entry || !copy) {
    return <PageHero eyebrow="Solusi" title="Solusi tidak ditemukan" body="Tautan ini tidak mengarah ke kelompok solusi yang ada."><Link to="/solutions" className="text-accent underline">Kembali ke semua solusi</Link></PageHero>
  }
  const [, label, ids] = entry
  const index = MENU_GROUPS.findIndex(([id]) => id === group)
  const next = MENU_GROUPS[(index + 1) % MENU_GROUPS.length]!

  return (
    <>
      <PageHero eyebrow="Solusi" icon={copy.icon} title={label} body={copy.body}>
        <ul className="grid gap-3 sm:grid-cols-3">
          {copy.outcomes.map((o) => (
            <li key={o} className="flex gap-2 rounded-2xl border border-line bg-raised p-4 text-sm">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" /> {o}
            </li>
          ))}
        </ul>
      </PageHero>

      <section className="space-y-6 px-5 pb-20 sm:px-8 lg:px-12">
        {ids.map((id, i) => {
          const m = modules.data?.find((x) => x.id === id)
          const mc = MODULE_COPY[id]
          const Icon = moduleIcon(id)
          const types = typesOf(id)
          const subs = subModulesOf(id)
          return (
            <Reveal key={id} as="article" className="grid gap-8 rounded-3xl border border-line bg-card shadow-card p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr]">
              <div>
                <div className="flex items-center gap-4">
                  <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-strong shadow-glow">
                    <Icon aria-hidden className="size-8 text-white" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium tracking-wide text-muted uppercase">
                      {String(i + 1).padStart(2, '0')} · {m?.code ?? id.toUpperCase()}
                    </p>
                    <h2 className="text-2xl font-semibold">{moduleLabel(id)}</h2>
                    {m && <p className="text-sm text-muted">{m.name}</p>}
                  </div>
                </div>
                <p className="mt-6 text-muted">{mc?.body}</p>
                <ul className="mt-6 space-y-3">
                  {mc?.features.map((f) => (
                    <li key={f} className="flex gap-3">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent/20">
                        <Check aria-hidden className="size-3.5 text-accent" />
                      </span>
                      <span className="text-sm">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid content-start gap-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    [types.length, 'jenis data'],
                    [types.filter((t) => t.workflow.transitions.some((x) => x.needs === 'approve')).length, 'dengan persetujuan'],
                    [m?.users.length ?? 0, 'peran pengguna'],
                  ].map(([n, l]) => (
                    <div key={l} className="rounded-2xl bg-raised p-4">
                      <p className="text-2xl font-semibold tabular">{n}</p>
                      <p className="text-[11px] text-muted">{l}</p>
                    </div>
                  ))}
                </div>
                {subs.length > 0 && (
                  <div className="rounded-2xl bg-raised p-4">
                    <p className="text-xs font-medium tracking-wide text-muted uppercase">Sub-modul</p>
                    <p className="mt-2 flex flex-wrap gap-2">
                      {subs.map((s) => (
                        <span key={s} className="rounded-full border border-line-strong px-3 py-1 text-xs">
                          {s}
                        </span>
                      ))}
                    </p>
                  </div>
                )}
                {m && (
                  <div className="rounded-2xl bg-raised p-4">
                    <p className="text-xs font-medium tracking-wide text-muted uppercase">Untuk tim</p>
                    <p className="mt-2 text-sm">{m.departments.join(' · ')}</p>
                  </div>
                )}
                {m?.kpis.length ? (
                  <div className="grid grid-cols-2 gap-3">
                    {m.kpis.slice(0, 2).map((k) => (
                      <div key={k.label} className="rounded-2xl border border-accent/30 bg-accent/10 p-4">
                        <p className="text-xl font-semibold tabular">{k.value}</p>
                        <p className="text-[11px] text-muted">{k.label}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </Reveal>
          )
        })}
      </section>

      <section className="flex flex-wrap items-center gap-4 px-5 pb-24 sm:px-8 lg:px-12">
        <Link to="/solutions" className="inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft aria-hidden className="size-4" /> Semua solusi
        </Link>
        <Link to={`/solutions/${next[0]}`} className="ml-auto inline-flex items-center gap-2 rounded-full border border-line-strong px-5 py-3 text-sm font-medium hover:bg-raised">
          Berikutnya: {next[1]} <ArrowRight aria-hidden className="size-4" />
        </Link>
      </section>
    </>
  )
}
