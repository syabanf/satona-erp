import { Link } from 'react-router'
import { ArrowUpRight, Search } from 'lucide-react'
import { suggestedTasks } from '@/domain/taskNavigation'
import type { Access, Role } from '@/domain/erp'
import { usePalette } from './palette'

export function TaskLauncher({ role, accessFor, approvals }: { role: Role; accessFor: (module: string) => Access; approvals: number }) {
  const openSearch = usePalette()
  const tasks = suggestedTasks(role, accessFor, approvals)

  return (
    <section aria-labelledby="start-here" className="mb-4 rounded-card border border-line bg-card p-5 shadow-card">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="start-here" className="text-lg font-semibold">Mau mengerjakan apa?</h2>
          <p className="mt-1 text-sm text-muted">Tugas untuk {role.name}. Cari jika tugas Anda belum terlihat.</p>
        </div>
        <button type="button" onClick={() => openSearch()} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line-strong bg-raised px-4 text-sm font-medium hover:bg-control">
          <Search aria-hidden className="size-4" /> Cari pekerjaan
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tasks.map((task) => (
          <Link key={task.id} to={task.to} className="group flex min-h-28 flex-col justify-between rounded-panel border border-line bg-raised p-3 transition-colors hover:border-accent hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-4">
            <ArrowUpRight aria-hidden className="ml-auto size-4 text-subtle group-hover:text-accent-text" />
            <span>
              <span className="block text-sm font-semibold">{task.title}</span>
              <span className="mt-0.5 block text-xs text-muted">{task.detail}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
