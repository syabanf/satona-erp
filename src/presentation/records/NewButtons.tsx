import { Plus } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { canCreate, type Values } from '@/domain/records'
import { cn } from '@/lib/cn'
import { useAccess } from '../hooks/useRecords'
import { Button } from '../ui/Button'
import { useRecordDrawer } from './drawer'

/** "New …" buttons for the record types an operational page works with; types the role cannot create stay hidden. */
export function NewButtons({ types, prefill, className }: { types: readonly string[]; prefill?: Values; className?: string }) {
  const accessFor = useAccess()
  const open = useRecordDrawer()
  const shown = types.map((k) => typeOf(k)).filter((t) => t && canCreate(t, accessFor(t.module)))
  if (!shown.length) return null
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {shown.map((t, i) => (
        <Button key={t!.key} size="sm" variant={i === 0 ? 'accent' : 'card'} onClick={() => open({ mode: 'create', type: t!.key, prefill })}>
          <Plus aria-hidden className="size-4" /> {t!.singular}
        </Button>
      ))}
    </div>
  )
}
