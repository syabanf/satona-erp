import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, ChevronsUpDown, LogOut, Search } from 'lucide-react'
import { ADMIN_ROLE, filterRoles, type Role } from '@/domain/erp'
import { homeFor } from '@/domain/menu'
import { cn } from '@/lib/cn'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { Avatar } from '../../ui/Avatar'
import { Input } from '../../ui/Field'
import { menuItem, Popover } from '../../ui/Popover'
import { useToast } from '../../ui/useToast'

const ENTITY = { holding: 'Holding', rotama: 'Rotama', rodame: 'Rodame', roasi: 'Roasi' } as const

/** The account row: shows the signed-in role and switches to any role from the user matrix. */
export function RoleSwitcher({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { erp } = useServices()
  const { role, setRole, signOut } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const roles = useResource('erp.roles', () => erp.roles())
  const [q, setQ] = useState('')
  const list = [ADMIN_ROLE, ...filterRoles(roles.data ?? [], { q })].filter((r, i) => i > 0 || !q || r.name.toLowerCase().includes(q.toLowerCase()))

  function pick(next: Role, close: () => void) {
    setRole(next)
    close()
    onNavigate?.()
    navigate(homeFor(next))
    toast({ title: `Masuk sebagai ${next.name}`, description: 'Menu dan tugas kini mengikuti peran ini.' })
  }

  return (
    <Popover
      align="left"
      width="w-72"
      side="top"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={`Peran saat ini ${role.name}. Ganti peran`}
          title={collapsed ? role.name : undefined}
          className={cn('flex w-full cursor-pointer items-center gap-3 rounded-2xl p-1.5 text-left transition-colors hover:bg-raised', collapsed && 'justify-center')}
        >
          <Avatar name={role.name} />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-semibold">{role.name}</span>
                <span className="block truncate text-xs text-muted">
                  {ENTITY[role.entity]} · {role.department}
                </span>
              </span>
              <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-muted" />
            </>
          )}
        </button>
      )}
    >
      {(close) => (
        <div>
          <p className="px-3 pt-1 pb-2 eyebrow">Pilih peran</p>
          <Input className="mb-2 h-10" icon={<Search className="size-4" />} placeholder="Peran atau bagian" aria-label="Cari peran" value={q} onChange={(e) => setQ(e.target.value)} />
          <button
            type="button"
            onClick={() => {
              close()
              signOut()
              navigate('/login', { replace: true })
            }}
            className={cn(menuItem, 'mb-1 border-b border-line pb-3 text-accent-text')}
          >
            <LogOut aria-hidden className="size-4" /> Keluar
          </button>
          <ul className="max-h-72 overflow-y-auto">
            {list.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => pick(r, close)} className={cn(menuItem, 'py-2')}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-fg">{r.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {r.id === ADMIN_ROLE.id ? 'Dapat menyetujui di semua modul' : `${ENTITY[r.entity]} · ${r.module.toUpperCase()}${r.external ? ' · pengguna luar' : ''}`}
                    </span>
                  </span>
                  {r.id === role.id && <Check aria-hidden className="size-4 text-accent-text" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Popover>
  )
}
