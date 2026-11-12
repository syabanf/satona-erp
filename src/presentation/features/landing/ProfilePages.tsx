import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Building2, Check, Cpu, Database, Globe, Layers, Mail, MonitorSmartphone, Send } from 'lucide-react'
import { MENU_GROUPS } from '@/domain/menu'
import { APP_NAME } from '@/lib/brand'
import { cn } from '@/lib/cn'
import { CAPABILITIES, STEPS, VALUES } from './content'
import { PageHero, Reveal } from './SiteLayout'

const STACK = [
  { icon: MonitorSmartphone, title: 'Pengguna', body: 'Dashboard, ponsel, OS view, portal sopir dan pemasok' },
  { icon: Layers, title: 'Modul', body: 'Produksi, perawatan, rantai pasok, keuangan, SDM dan tata kelola' },
  { icon: Database, title: 'Mesin data', body: 'Skema, validasi, alur kerja, persetujuan bertingkat, hak akses' },
  { icon: Globe, title: 'Integrasi', body: 'API gateway, CDC, broker event, SSO' },
  { icon: Cpu, title: 'Lantai pabrik', body: 'PLC, sensor, gateway, SCADA, GPS, CCTV' },
]

/** How the platform is built: the layered architecture, then each capability with its icon and what it covers. */
export function PlatformPage() {
  return (
    <>
      <PageHero eyebrow="Platform" title="Dibangun untuk pabrik yang terus bergerak" body={`${APP_NAME} memakai satu mesin data untuk semua modul, sehingga setiap dokumen, mesin dan orang terhubung dari lantai produksi sampai laporan direksi.`} />
      <section className="px-5 pb-20 sm:px-8 lg:px-12">
        <Reveal className="rounded-3xl border border-line bg-card shadow-card p-6 sm:p-8">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Arsitektur</p>
          <ol className="mt-6 space-y-3">
            {STACK.map((s, i) => (
              <li key={s.title} className={cn('flex flex-wrap items-center gap-4 rounded-2xl border p-4 sm:flex-nowrap', i === 2 ? 'border-accent bg-accent/15' : 'border-line bg-raised')}>
                <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', i === 2 ? 'bg-accent' : 'bg-control')}>
                  <s.icon aria-hidden className="size-5" />
                </span>
                <span className="w-32 shrink-0 font-semibold">{s.title}</span>
                <span className="text-sm text-muted">{s.body}</span>
              </li>
            ))}
          </ol>
        </Reveal>
      </section>
      <section className="grid gap-5 px-5 pb-24 sm:px-8 md:grid-cols-2 lg:px-12">
        {CAPABILITIES.map((c, i) => (
          <Reveal key={c.title} as="article" delay={(i % 2) * 90} className="rounded-3xl border border-line bg-card shadow-card p-7">
            <span className="grid size-12 place-items-center rounded-2xl bg-control">
              <c.icon aria-hidden className="size-6 text-accent" />
            </span>
            <h2 className="mt-5 text-xl font-semibold">{c.title}</h2>
            <p className="mt-2 text-sm text-muted">{c.body}</p>
            <ul className="mt-5 space-y-2">
              {c.points.map((p) => (
                <li key={p} className="flex gap-2 text-sm">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" /> {p}
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </section>
    </>
  )
}

/** Company-profile page: who the platform is for, vision and mission, values, and how an implementation runs. */
export function AboutPage() {
  return (
    <>
      <PageHero eyebrow="Tentang" icon={Building2} title="Platform manufaktur dari WIT.id" body={`${APP_NAME} adalah platform manufaktur dari WIT.id, perusahaan transformasi digital. Kami membangunnya untuk pabrik yang ingin menyatukan mesin, proses dan orang dalam satu sistem.`} />
      <section className="grid gap-5 px-5 pb-20 sm:px-8 lg:grid-cols-2 lg:px-12">
        <Reveal as="article" className="rounded-3xl bg-accent p-8 text-white shadow-glow">
          <p className="text-xs font-medium tracking-wide uppercase opacity-80">Visi</p>
          <p className="mt-4 text-2xl leading-snug font-semibold">Setiap pabrik di Indonesia berjalan dengan data yang terhubung, dari mesin sampai ruang direksi.</p>
        </Reveal>
        <Reveal as="article" delay={90} className="rounded-3xl border border-line bg-card shadow-card p-8">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Misi</p>
          <ul className="mt-4 space-y-3">
            {['Menyatukan modul pabrik dalam satu mesin data', 'Menghubungkan perangkat lantai produksi secara langsung', 'Membuat setiap peran bekerja dari layar yang relevan', 'Menerapkan bertahap bersama tim pabrik'].map((m) => (
              <li key={m} className="flex gap-3">
                <Check aria-hidden className="mt-1 size-4 shrink-0 text-accent" /> {m}
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      <section className="px-5 pb-20 sm:px-8 lg:px-12">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Nilai kami<span className="text-accent">.</span>
          </h2>
        </Reveal>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {VALUES.map((v, i) => (
            <Reveal key={v.title} as="article" delay={i * 90} className="rounded-3xl border border-line bg-card shadow-card p-6">
              <v.icon aria-hidden className="size-7 text-accent" />
              <h3 className="mt-5 text-lg font-semibold">{v.title}</h3>
              <p className="mt-2 text-sm text-muted">{v.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="px-5 pb-24 sm:px-8 lg:px-12">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Cara kami menerapkan<span className="text-accent">.</span>
          </h2>
        </Reveal>
        <ol className="relative mt-10 grid gap-5 md:grid-cols-4">
          <span aria-hidden className="absolute top-7 right-8 left-8 hidden h-px bg-gradient-to-r from-accent via-line-strong to-transparent md:block" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} as="li" delay={i * 120} className="relative">
              <span className="relative grid size-14 place-items-center rounded-2xl border border-line-strong bg-card shadow-card">
                <s.icon aria-hidden className="size-6 text-accent" />
              </span>
              <p className="mt-5 text-xs font-medium text-muted">Langkah {i + 1}</p>
              <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-muted">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>
    </>
  )
}

/** Demo request form. The demo keeps the request on this device and says so; nothing leaves the browser. */
export function ContactPage() {
  const [sent, setSent] = useState<string | null>(null)
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSent(String(new FormData(e.currentTarget).get('name') ?? ''))
  }
  const field = 'mt-1.5 h-12 w-full rounded-xl border border-line-strong bg-card px-4 text-base text-fg outline-none placeholder:text-subtle focus:border-accent'
  return (
    <>
      <PageHero eyebrow="Kontak" icon={Mail} title="Ceritakan pabrik Anda" body="Isi formulir ini dan tim kami menyiapkan demo dengan proses yang paling dekat dengan pabrik Anda." />
      <section className="grid gap-8 px-5 pb-24 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:px-12">
        <Reveal className="rounded-3xl border border-line bg-card shadow-card p-6 sm:p-8">
          {sent !== null ? (
            <div className="py-10 text-center" role="status">
              <span className="mx-auto grid size-14 place-items-center rounded-full bg-accent">
                <Check aria-hidden className="size-7" />
              </span>
              <p className="mt-5 text-xl font-semibold">Terima kasih{sent ? `, ${sent}` : ''}.</p>
              <p className="mt-2 text-sm text-muted">Ini versi demo, jadi permintaan Anda hanya tersimpan di perangkat ini. Sambil menunggu, coba langsung platformnya.</p>
              <Link to="/login" className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-semibold">
                Coba demo <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
              <label className="text-sm">
                Nama
                <input name="name" required autoComplete="name" className={field} placeholder="Nama lengkap" />
              </label>
              <label className="text-sm">
                Perusahaan
                <input name="company" required autoComplete="organization" className={field} placeholder="Nama perusahaan" />
              </label>
              <label className="text-sm">
                Email kerja
                <input name="email" type="email" required autoComplete="email" className={field} placeholder="nama@perusahaan.com" />
              </label>
              <label className="text-sm">
                Minat utama
                <select name="interest" className={cn(field, 'cursor-pointer')} defaultValue={MENU_GROUPS[0]![1]}>
                  {MENU_GROUPS.map(([id, label]) => (
                    <option key={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm sm:col-span-2">
                Ceritakan kebutuhan Anda
                <textarea name="message" rows={5} className={cn(field, 'h-auto py-3')} placeholder="Misal: kami punya 2 lini granulasi dan ingin memantau OEE serta perawatan mesin." />
              </label>
              <button type="submit" className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-accent px-6 font-semibold shadow-glow transition-transform active:scale-[0.97] sm:col-span-2 sm:w-fit">
                <Send aria-hidden className="size-4" /> Minta demo
              </button>
            </form>
          )}
        </Reveal>
        <Reveal delay={90} className="space-y-4">
          {[
            ['Demo terarah', 'Tim kami menunjukkan alur yang paling dekat dengan proses Anda, dari perintah kerja sampai laporan.'],
            ['Uji di pabrik Anda', 'Hubungkan satu lini atau satu gudang dulu, lihat hasilnya, lalu perluas.'],
            ['Pendampingan', 'Pelatihan per peran dan tutorial di dalam aplikasi untuk setiap pengguna.'],
          ].map(([t, b]) => (
            <div key={t} className="rounded-3xl border border-line bg-card shadow-card p-6">
              <p className="font-semibold">{t}</p>
              <p className="mt-1 text-sm text-muted">{b}</p>
            </div>
          ))}
          <a href="https://wit.id" target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-3xl bg-raised p-6 text-sm hover:bg-raised">
            <Globe aria-hidden className="size-4 text-accent" /> Kenali WIT.id lebih jauh di wit.id
          </a>
        </Reveal>
      </section>
    </>
  )
}
