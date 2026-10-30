import { stateOf, type RecordType } from '@/domain/records'
import { StatusPill } from '../ui/Badge'

export function StateBadge({ type, status }: { type: RecordType; status: string }) {
  const state = stateOf(type, status)
  return <StatusPill tone={state?.tone ?? 'neutral'}>{state?.label ?? status}</StatusPill>
}
