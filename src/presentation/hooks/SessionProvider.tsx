import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ADMIN_ROLE, type Role } from '@/domain/erp'
import { SessionContext } from './useSession'

const KEY = 'satona-session'

/** The sign-in lasts for the browser tab; storage may be blocked, so every access is guarded. */
function restore(): Role | null {
  try {
    const saved = sessionStorage.getItem(KEY)
    return saved ? (JSON.parse(saved) as Role) : null
  } catch {
    return null
  }
}

function persist(role: Role | null) {
  try {
    if (role) sessionStorage.setItem(KEY, JSON.stringify(role))
    else sessionStorage.removeItem(KEY)
  } catch {
    // Blocked storage: the sign-in lasts until the next reload.
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role | null>(restore)
  const signIn = useCallback((next: Role) => {
    persist(next)
    setRoleState(next)
  }, [])
  const signOut = useCallback(() => {
    persist(null)
    setRoleState(null)
  }, [])
  const value = useMemo(() => ({ role: role ?? ADMIN_ROLE, signedIn: role !== null, signIn, signOut, setRole: signIn }), [role, signIn, signOut])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}
