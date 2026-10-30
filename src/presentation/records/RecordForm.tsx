import { useState, type FormEvent } from 'react'
import { ValidationError } from '@/domain/errors'
import { computeValues, display, type Field, type RecordType, type Values } from '@/domain/records'
import { cn } from '@/lib/cn'
import { Button } from '../ui/Button'
import { Input, Select } from '../ui/Field'
import { useToast } from '../ui/useToast'
import { ENTITY_NAME, refTitle, type AllRecords } from './text'

interface RecordFormProps {
  type: RecordType
  initial?: Values
  all?: AllRecords
  submitLabel: string
  onSubmit: (values: Values) => Promise<unknown>
  onCancel: () => void
}

const inputType = (f: Field) => (f.type === 'number' || f.type === 'money' ? 'number' : f.type === 'date' ? 'date' : 'text')

/** One form for every record type. Computed fields preview live; a failed save keeps the input and marks the fields. */
export function RecordForm({ type, initial = {}, all, submitLabel, onSubmit, onCancel }: RecordFormProps) {
  const toast = useToast()
  const [values, setValues] = useState<Values>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const preview = computeValues(type, values)

  const set = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }))
    if (errors[key])
      setErrors((current) => {
        const next = { ...current }
        delete next[key]
        return next
      })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await onSubmit(values)
    } catch (err) {
      if (err instanceof ValidationError) setErrors(err.fields)
      toast({ tone: 'danger', title: 'Not saved', description: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      {type.fields.map((f) => {
        const id = `field-${f.key}`
        const error = errors[f.key]
        const value = values[f.key] === undefined ? '' : String(values[f.key])
        const wide = f.type === 'textarea' || f.key === type.titleField
        let control
        if (f.type === 'computed') {
          control = <p className="flex h-12 items-center rounded-full bg-control px-4 text-sm font-semibold tabular">{display(f, preview[f.key])}</p>
        } else if (f.type === 'textarea') {
          control = (
            <textarea
              id={id}
              rows={3}
              value={value}
              onChange={(e) => set(f.key, e.target.value)}
              aria-invalid={Boolean(error)}
              className="w-full rounded-panel border border-line-strong bg-raised px-4 py-3 text-base outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:text-sm"
            />
          )
        } else if (f.type === 'select' || f.type === 'entity' || f.type === 'ref') {
          const options =
            f.type === 'ref'
              ? (all?.[f.ref ?? ''] ?? []).map((r) => ({ value: r.id, label: refTitle(f.ref ?? '', r.id, all) }))
              : (f.options ?? []).map((o) => ({ value: o, label: f.type === 'entity' ? (ENTITY_NAME[o] ?? o) : o }))
          control = <Select id={id} className="w-full" value={value} onChange={(e) => set(f.key, e.target.value)} aria-invalid={Boolean(error)} options={[{ value: '', label: `Choose ${f.label.toLowerCase()}` }, ...options]} />
        } else {
          control = (
            <Input
              id={id}
              type={inputType(f)}
              inputMode={inputType(f) === 'number' ? 'decimal' : undefined}
              step="any"
              value={value}
              onChange={(e) => set(f.key, e.target.value)}
              aria-invalid={Boolean(error)}
              className={cn('h-12', error && 'border-danger')}
              trailing={f.unit ? <span className="pr-3 text-xs text-muted">{f.unit}</span> : undefined}
            />
          )
        }
        return (
          <div key={f.key} className={cn('min-w-0', wide && 'sm:col-span-2')}>
            <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted">
              {f.label}
              {f.required && <span className="text-accent-text"> *</span>}
              {f.type === 'computed' && ' (calculated)'}
            </label>
            {control}
            {error && (
              <p role="alert" className="mt-1 text-xs text-danger">
                {error}
              </p>
            )}
          </div>
        )
      })}
      <div className="flex flex-wrap gap-2 pt-2 sm:col-span-2">
        <Button type="submit" variant="solid" loading={busy}>
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
