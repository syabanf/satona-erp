import { createContext, useContext } from 'react'
import type { Role } from '@/domain/erp'

export interface Session {
  role: Role
  signedIn: boolean
  signIn: (role: Role) => void
  signOut: () => void
  /** Switches role without leaving the console (the account menu). */
  setRole: (role: Role) => void
}

export const SessionContext = createContext<Session | null>(null)

/** The role the demo is signed in as. Every write and every gated button reads it. */
export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession needs a <SessionProvider> above it')
  return session
}
