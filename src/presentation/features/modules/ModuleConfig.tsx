import { Link } from 'react-router'
import { ArrowRight, Check } from 'lucide-react'
import { typeOf, typesOf } from '@/domain/catalog'
import { Tag } from '../../ui/Badge'
import { Card } from '../../ui/Card'
import { recordPath } from '../../records/text'
import { useModule } from './context'

const TYPE_LABEL: Record<string, string> = {
  text: 'Text',
  textarea: 'Long text',
  number: 'Number',
  money: 'Amount (Rp)',
  date: 'Date',
  select: 'Pick list',
  ref: 'Reference',
  entity: 'Entity',
  computed: 'Calculated',
}

/** Configuration: every record type's fields and workflow, as an implementation consultant would review them. */
export default function ModuleConfig() {
  const { module: m } = useModule()
  return (
    <div className="space-y-4">
      {typesOf(m.id).map((t) => (
        <Card key={t.key} className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <div className="min-w-0">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                {t.name}
                <Tag tone={t.area === 'master' ? 'info' : 'neutral'}>{t.area === 'master' ? 'Master data' : 'Transaction'}</Tag>
              </h2>
              <p className="text-xs text-muted">
                Number range <span className="font-mono">{t.prefix}-0001</span> · T-codes <span className="font-mono">{t.prefix}01</span> create, <span className="font-mono">{t.prefix}02</span> list
              </p>
            </div>
            <Link to={recordPath(t)} className="inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline">
              Open records <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-5 py-2 font-medium">Field</th>
                  <th className="px-3 py-2 font-medium">Key</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Rules</th>
                  <th className="px-5 py-2 text-center font-medium">Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {t.fields.map((f) => {
                  const target = f.ref ? typeOf(f.ref) : undefined
                  const rules = [
                    f.unit && `unit ${f.unit}`,
                    f.min !== undefined && `min ${f.min}`,
                    f.max !== undefined && `max ${f.max}`,
                    f.options && f.type === 'select' && `${f.options.length} values`,
                    f.list && 'list column',
                  ].filter(Boolean)
                  return (
                    <tr key={f.key} data-motion="row">
                      <td className="px-5 py-2.5 font-medium">{f.label}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted">{f.key}</td>
                      <td className="px-3 py-2.5">
                        {target ? (
                          <Link to={recordPath(target)} className="text-accent-text hover:underline">
                            → {target.name}
                          </Link>
                        ) : (
                          TYPE_LABEL[f.type]
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">{rules.join(' · ') || '·'}</td>
                      <td className="px-5 py-2.5 text-center">{f.required && <Check aria-label="Required" className="mx-auto size-4 text-success" />}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-line px-5 py-4">
            <p className="mb-2 eyebrow">Workflow</p>
            <ul className="flex flex-wrap gap-2 text-xs">
              {t.workflow.transitions.map((tr) => (
                <li key={`${tr.from}-${tr.to}`} className="inline-flex items-center gap-1.5 rounded-full bg-raised px-3 py-1.5">
                  <span className="text-muted">{t.workflow.states.find((s) => s.id === tr.from)?.label}</span>
                  <ArrowRight aria-hidden className="size-3 text-subtle" />
                  <span className="font-medium">{t.workflow.states.find((s) => s.id === tr.to)?.label}</span>
                  <span className="text-subtle">· {tr.label}</span>
                  {tr.needs === 'approve' && <Tag tone="accent">Approver</Tag>}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ))}
    </div>
  )
}
