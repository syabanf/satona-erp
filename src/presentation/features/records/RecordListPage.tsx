import { useEffect } from 'react'
import { Plus } from 'lucide-react'
import { canCreate } from '@/domain/records'
import { useAllRecords, useRecordList } from '../../hooks/useRecords'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { CardSkeleton } from '../../ui/States'
import { useRecordDrawer } from '../../records/drawer'
import { RecordInsight } from '../../records/RecordInsight'
import { RecordTable } from '../../records/RecordTable'
import { NotFound } from '../NotFound'
import { useModule } from '../modules/context'
import { useRecordType } from './useRecordType'

export default function RecordListPage() {
  const { type } = useRecordType()
  const { access } = useModule()
  const open = useRecordDrawer()
  const rows = useRecordList(type?.key ?? '')
  const all = useAllRecords()
  const creatable = Boolean(type && canCreate(type, access))

  // N opens a new record in the drawer, as long as the user is not typing somewhere.
  useEffect(() => {
    if (!type || !creatable) return
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))
      if (e.key === 'n' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) open({ mode: 'create', type: type.key })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [type, creatable, open])

  if (!type) return <NotFound />
  if (!rows.data) return <CardSkeleton lines={8} />

  return (
    <div className="space-y-4">
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <h2 className="text-lg font-semibold">{type.name}</h2>
          {creatable && (
            <Button variant="accent" size="sm" onClick={() => open({ mode: 'create', type: type.key })} title="Shortcut: N">
              <Plus aria-hidden className="size-4" /> New {type.singular.toLowerCase()}
              <kbd className="ml-1 hidden rounded border border-white/40 px-1 font-mono text-[10px] sm:inline">N</kbd>
            </Button>
          )}
        </div>
        <RecordTable type={type} rows={rows.data} all={all.data} />
      </Card>
      <details className="group rounded-card border border-line bg-card shadow-card">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold marker:text-accent-text">Insights and charts for {type.name.toLowerCase()}</summary>
        <div className="border-t border-line p-4">
          <RecordInsight type={type} rows={rows.data} all={all.data} />
        </div>
      </details>
    </div>
  )
}
