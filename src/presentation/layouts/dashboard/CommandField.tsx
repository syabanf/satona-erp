import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router'
import { CornerDownLeft, TerminalSquare } from 'lucide-react'
import { findByTcode, searchMenu, type MenuNode } from '@/domain/menu'
import { cn } from '@/lib/cn'
import { Input } from '../../ui/Field'
import { useToast } from '../../ui/useToast'

/** The command field: a transaction code (`TRP01`, `/nMR02`) jumps straight there; words search the menu. */
export function CommandField({ tree, onNavigate }: { tree: readonly MenuNode[]; onNavigate?: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [index, setIndex] = useState(0)
  const results = searchMenu(tree, q, 8)

  function go(node: MenuNode) {
    if (!node.to) return
    navigate(node.to)
    setQ('')
    setIndex(0)
    onNavigate?.()
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const exact = findByTcode(tree, q)
    const pick = exact ?? results[index]
    if (pick) go(pick)
    else if (q.trim()) toast({ tone: 'danger', title: `Transaction ${q.trim().toUpperCase()} does not exist`, description: 'Check the code, or type words such as "create trip".' })
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!results.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length)
    } else if (e.key === 'Escape') setQ('')
  }

  return (
    <form role="search" onSubmit={submit} className="relative">
      <Input
        className="h-10"
        icon={<TerminalSquare className="size-4" />}
        placeholder="T-code or search, e.g. TRP01"
        aria-label="Transaction code or menu search"
        aria-autocomplete="list"
        aria-controls="command-results"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setIndex(0)
        }}
        onKeyDown={onKeyDown}
        trailing={q ? <CornerDownLeft aria-hidden className="mr-2 size-3.5 text-subtle" /> : undefined}
      />
      {results.length > 0 && (
        <ul id="command-results" role="listbox" className="absolute inset-x-0 top-full z-50 mt-1.5 animate-rise rounded-panel border border-line-strong bg-card p-1.5 shadow-float">
          {results.map((n, i) => (
            <li key={n.id} role="option" aria-selected={i === index}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(n)}
                onMouseEnter={() => setIndex(i)}
                className={cn('flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm', i === index ? 'bg-raised text-fg' : 'text-body')}
              >
                <span className="w-14 shrink-0 font-mono text-[11px] font-semibold text-accent-text">{n.tcode}</span>
                <span className="min-w-0 flex-1 truncate">{n.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}
