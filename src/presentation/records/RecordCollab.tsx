import { useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Download, FileText, Image as ImageIcon, MessageSquare, Paperclip, Send, Trash2 } from 'lucide-react'
import type { Note } from '@/application/ports'
import { useResource } from '../hooks/useResource'
import { useServices } from '../hooks/useServices'
import { useSession } from '../hooks/useSession'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/useToast'

const MAX_BYTES = 5 * 1024 * 1024
const when = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

/** Comment text with every `@Role name` it mentions picked out in red. */
function Mentioned({ text, names }: { text: string; names: readonly string[] }) {
  const sorted = [...names].sort((a, b) => b.length - a.length)
  const parts: ReactNode[] = []
  let rest = text
  while (rest) {
    const i = rest.indexOf('@')
    const name = i >= 0 ? sorted.find((n) => rest.startsWith(`@${n}`, i)) : undefined
    if (i < 0 || !name) {
      parts.push(rest)
      break
    }
    parts.push(rest.slice(0, i), <span key={parts.length} className="rounded bg-accent-soft px-1 font-medium text-accent-text">@{name}</span>)
    rest = rest.slice(i + name.length + 1)
  }
  return <>{parts}</>
}

/**
 * Discussion and files for any record: comments with @mentions of roles, and attachments such as photos of a damaged
 * machine or a supplier's certificate. Both stay in the demo store with the author and time.
 */
export function RecordCollab({ target }: { target: string }) {
  const { collab, erp } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const version = useSyncExternalStore(collab.subscribe, collab.version)
  const notes = useResource(`collab:${target}:${version}`, () => collab.list(target))
  const roles = useResource('erp.roles', () => erp.roles())
  const [tab, setTab] = useState<'comments' | 'files'>('comments')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const names = (roles.data ?? []).map((r) => r.name)
  const comments = (notes.data ?? []).filter((n) => n.kind === 'comment')
  const files = (notes.data ?? []).filter((n) => n.kind === 'file')
  // The word being typed after an @ suggests matching roles.
  const mention = /@([^@\n]*)$/.exec(text)?.[1]
  const suggestions = mention !== undefined ? names.filter((n) => n.toLowerCase().includes(mention.toLowerCase())).slice(0, 5) : []

  async function post() {
    if (!text.trim()) return
    setBusy(true)
    await collab.add({ target, kind: 'comment', by: role.name, text: text.trim() })
    setText('')
    setBusy(false)
  }

  async function attach(list: FileList | null) {
    for (const file of Array.from(list ?? [])) {
      if (file.size > MAX_BYTES) {
        toast({ tone: 'danger', title: `${file.name} terlalu besar`, description: 'Batas lampiran 5 MB per file.' })
        continue
      }
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      await collab.add({ target, kind: 'file', by: role.name, file: { name: file.name, size: file.size, mime: file.type || 'application/octet-stream', url } })
      toast({ title: `${file.name} dilampirkan` })
    }
    if (input.current) input.current.value = ''
  }

  const remove = (n: Note) => collab.remove(n.id)

  return (
    <Card>
      <div className="mb-4 flex items-center gap-2">
        <Tabs
          label="Kolaborasi"
          variant="underline"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'comments', label: `Komentar (${comments.length})` },
            { value: 'files', label: `Lampiran (${files.length})` },
          ]}
        />
      </div>

      {tab === 'comments' ? (
        <div className="space-y-4">
          {comments.length === 0 && <p className="text-sm text-muted">Belum ada komentar. Mulai diskusi dan sebut peran dengan @.</p>}
          <ol className="space-y-3">
            {comments.map((n) => (
              <li key={n.id} className="flex gap-3">
                <Avatar name={n.by} size="sm" />
                <div className="min-w-0 flex-1 rounded-panel bg-raised p-3">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-semibold text-fg">{n.by}</span>
                    <span className="text-muted">{when(n.at)}</span>
                    {n.by === role.name && (
                      <button type="button" onClick={() => remove(n)} className="ml-auto cursor-pointer text-muted hover:text-danger">
                        Hapus
                      </button>
                    )}
                  </p>
                  <p className="mt-1 text-sm break-words whitespace-pre-wrap">
                    <Mentioned text={n.text ?? ''} names={names} />
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void post()
              }}
              rows={3}
              placeholder="Tulis komentar. Ketik @ untuk menyebut peran."
              aria-label="Komentar baru"
              className="w-full resize-y rounded-panel border border-line-strong bg-raised p-3 text-base outline-none focus:border-accent md:text-sm"
            />
            {suggestions.length > 0 && (
              <ul className="absolute bottom-full left-0 z-10 mb-1 w-72 rounded-panel border border-line-strong bg-card p-1 shadow-float">
                {suggestions.map((n) => (
                  <li key={n}>
                    <button type="button" onClick={() => setText(text.replace(/@([^@\n]*)$/, `@${n} `))} className="w-full cursor-pointer truncate rounded-lg px-2 py-1.5 text-left text-sm hover:bg-raised">
                      @{n}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-xs text-muted">Ctrl atau ⌘ + Enter untuk kirim</span>
              <Button size="sm" variant="accent" loading={busy} disabled={!text.trim()} onClick={post}>
                <Send aria-hidden className="size-4" /> Kirim
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-panel border-2 border-dashed border-line-strong p-6 text-center text-sm text-muted hover:border-accent hover:text-fg">
            <Paperclip aria-hidden className="size-6" />
            <span>Klik untuk melampirkan foto, PDF atau dokumen (maks. 5 MB per file)</span>
            <input ref={input} type="file" multiple className="sr-only" onChange={(e) => attach(e.target.files)} />
          </label>
          {files.length === 0 ? (
            <p className="text-sm text-muted">Belum ada lampiran.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {files.map((n) => {
                const image = n.file?.mime.startsWith('image/')
                return (
                  <li key={n.id} className="flex items-center gap-3 rounded-panel bg-raised p-2">
                    {image ? <img src={n.file?.url} alt={n.file?.name} className="size-12 shrink-0 rounded-lg object-cover" /> : <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-control">{n.file?.mime.includes('pdf') ? <FileText aria-hidden className="size-5" /> : <ImageIcon aria-hidden className="size-5" />}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{n.file?.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {size(n.file?.size ?? 0)} · {n.by} · {when(n.at)}
                      </span>
                    </span>
                    <a href={n.file?.url} download={n.file?.name} aria-label={`Unduh ${n.file?.name}`} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-control hover:text-fg">
                      <Download aria-hidden className="size-4" />
                    </a>
                    {n.by === role.name && (
                      <button type="button" aria-label={`Hapus ${n.file?.name}`} onClick={() => remove(n)} className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger">
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
        <MessageSquare aria-hidden className="size-3.5" /> Tersimpan di perangkat ini selama sesi demo.
      </p>
    </Card>
  )
}
