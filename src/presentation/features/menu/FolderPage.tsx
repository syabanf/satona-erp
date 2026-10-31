import { Link, useParams } from 'react-router'
import { ChevronRight, Folder } from 'lucide-react'
import { typeOf } from '@/domain/catalog'
import { chainTo, folderPath, walk, type MenuNode } from '@/domain/menu'
import { cn } from '@/lib/cn'
import { useMenu } from '../../hooks/useMenu'
import { useAllRecords } from '../../hooks/useRecords'
import { useResource } from '../../hooks/useResource'
import { useServices } from '../../hooks/useServices'
import { MENU_ICON } from '../../layouts/dashboard/MenuNavigator'
import { buttonStyles } from '../../ui/buttonStyles'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { EntityFolder, FeatureFolder, ModuleFolder } from './FeaturePages'

const tile =
  'group flex h-full flex-col rounded-card border border-line bg-card p-5 shadow-card transition-[background-color,translate] duration-300 active:scale-[0.97] [@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-1'
const KIND_LABEL: Record<MenuNode['kind'], string> = {
  folder: 'Folder',
  create: 'Create',
  master: 'Master data',
  transaction: 'Worklist',
  approval: 'Approval',
  report: 'Report',
  config: 'Configuration',
  page: 'Page',
}

/** One sub-feature: a folder card counts what sits inside it, a leaf card opens the screen. */
function FeatureCard({ node, counts }: { node: MenuNode; counts: Record<string, number> }) {
  if (node.children) {
    const leaves = [...walk(node.children)].filter((c) => c.to)
    return (
      <Link to={folderPath(node.id)} data-motion="rise" className={tile}>
        <span className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-raised">
            <Folder aria-hidden className="size-5 text-muted" />
          </span>
          <span className="min-w-0 flex-1 font-semibold text-fg">{node.label}</span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
        </span>
        <span className="mt-3 line-clamp-2 text-xs text-muted">{leaves.slice(0, 4).map((l) => l.label).join(' · ')}</span>
        <span className="mt-auto pt-3 text-xs text-subtle tabular">
          {node.children.length} {node.children.length === 1 ? 'item' : 'items'}, {leaves.length} screens
        </span>
      </Link>
    )
  }
  const Icon = MENU_ICON[node.kind]
  const waiting = node.approval ? (counts[`${node.approval.type}:${node.approval.status}`] ?? 0) : 0
  return (
    <Link to={node.to ?? '/'} data-motion="rise" className={tile}>
      <span className="flex items-center gap-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', node.kind === 'create' ? 'bg-accent-soft' : 'bg-raised')}>
          <Icon aria-hidden className={cn('size-5', node.kind === 'create' ? 'text-accent-text' : 'text-muted')} />
        </span>
        <span className="min-w-0 flex-1 font-semibold text-fg">{node.label}</span>
        {waiting > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent-strong px-1.5 text-[11px] font-semibold text-white tabular">
            {waiting}
            <span className="sr-only"> waiting</span>
          </span>
        )}
      </span>
      <span className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs">
        <span className="text-muted">{KIND_LABEL[node.kind]}</span>
        {node.tcode && <span className="tcode rounded-full bg-raised px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-text">{node.tcode}</span>}
      </span>
    </Link>
  )
}

/**
 * Landing page of a menu folder, shaped by what the folder holds: a feature gets its numbers, actions and
 * related features; a module or its master data and transactions get one card per feature; a company gets
 * one card per module. Other folders list their sub-features as cards.
 */
export default function FolderPage() {
  const { id = '' } = useParams()
  const { tree, counts } = useMenu()
  const { erp } = useServices()
  const all = useAllRecords()
  const modules = useResource('erp.modules', () => erp.modules())
  const entities = useResource('erp.entities', () => erp.entities())
  if (!tree.length || !all.data || !modules.data || !entities.data) return <CardSkeleton lines={6} />
  const node = chainTo(tree, id).at(-1)
  if (!node?.children)
    return (
      <EmptyState title="This folder is not in your menu" action={<Link to="/" className={buttonStyles({ variant: 'soft' })}>Back to the overview</Link>}>
        Your role may not reach it, or the link is out of date.
      </EmptyState>
    )
  const type = id.endsWith(':folder') ? typeOf(id.replace(/:folder$/, '')) : undefined
  if (type) return <FeatureFolder node={node} type={type} tree={tree} all={all.data} />
  const module = modules.data.find((m) => m.id === id.replace(/:(master|transactions)$/, ''))
  if (module && !/:(reports|config)$/.test(id)) return <ModuleFolder key={id} node={node} module={module} all={all.data} />
  const entity = entities.data.find((e) => `entity:${e.id}` === id)
  if (entity) return <EntityFolder node={node} entity={entity} modules={modules.data} all={all.data} />
  const folders = node.children.filter((c) => c.children)
  const screens = node.children.filter((c) => !c.children)
  const grid = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
  return (
    <div className="space-y-6">
      {folders.length > 0 && (
        <section aria-label="Sub-features" className={grid}>
          {folders.map((c) => (
            <FeatureCard key={c.id} node={c} counts={counts} />
          ))}
        </section>
      )}
      {screens.length > 0 && (
        <section aria-label="Screens" className="space-y-3">
          {folders.length > 0 && <h2 className="text-lg font-semibold">Screens</h2>}
          <div className={grid}>
            {screens.map((c) => (
              <FeatureCard key={c.id} node={c} counts={counts} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
