import type { ComponentType } from 'react'
import { createBrowserRouter } from 'react-router'
import { NotFound } from '@/presentation/features/NotFound'
import { DashboardShell } from '@/presentation/layouts/DashboardShell'

/** Each page loads as its own chunk. */
const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({ Component: (await load()).default })

export const router = createBrowserRouter([
  { path: 'login', lazy: page(() => import('@/presentation/features/login/LoginPage')) },
  { path: 'os', lazy: page(() => import('@/presentation/features/os/OsDesktop')) },
  {
    element: <DashboardShell />,
    children: [
      { index: true, lazy: page(() => import('@/presentation/features/overview/OverviewPage')) },
      { path: 'entities/:id', lazy: page(() => import('@/presentation/features/entities/EntityPage')) },
      { path: 'modules', lazy: page(() => import('@/presentation/features/modules/ModulesPage')) },
      {
        path: 'modules/:id',
        lazy: page(() => import('@/presentation/features/modules/ModuleLayout')),
        children: [
          { index: true, lazy: page(() => import('@/presentation/features/modules/ModuleInsight')) },
          { path: 'about', lazy: page(() => import('@/presentation/features/modules/ModuleAbout')) },
          { path: 'config', lazy: page(() => import('@/presentation/features/modules/ModuleConfig')) },
          { path: ':type', lazy: page(() => import('@/presentation/features/records/RecordListPage')) },
          { path: ':type/new', lazy: page(() => import('@/presentation/features/records/RecordFormPage')) },
          { path: ':type/:rid', lazy: page(() => import('@/presentation/features/records/RecordPage')) },
          { path: ':type/:rid/edit', lazy: page(() => import('@/presentation/features/records/RecordFormPage')) },
        ],
      },
      { path: 'fleet/checkin', lazy: page(() => import('@/presentation/features/fleet/CheckinPage')) },
      { path: 'fleet/safety', lazy: page(() => import('@/presentation/features/fleet/SafetyPage')) },
      { path: 'occ', lazy: page(() => import('@/presentation/features/occ/CommandCentre')) },
      { path: 'mes/cockpit', lazy: page(() => import('@/presentation/features/mes/ProductionCockpit')) },
      { path: 'eam/reliability', lazy: page(() => import('@/presentation/features/mes/ReliabilityCockpit')) },
      { path: 'she', lazy: page(() => import('@/presentation/features/she/SheCockpit')) },
      { path: 'hris', lazy: page(() => import('@/presentation/features/hris/HrCockpit')) },
      { path: 'finance', lazy: page(() => import('@/presentation/features/finance/FinanceCockpit')) },
      { path: 'approvals', lazy: page(() => import('@/presentation/features/approvals/ApprovalsPage')) },
      { path: 'users', lazy: page(() => import('@/presentation/features/users/UsersPage')) },
      { path: 'users/:id', lazy: page(() => import('@/presentation/features/users/RolePage')) },
      { path: 'fleet', lazy: page(() => import('@/presentation/features/fleet/FleetPage')) },
      { path: 'distribution', lazy: page(() => import('@/presentation/features/distribution/DistributionPage')) },
      { path: 'tank-farm', lazy: page(() => import('@/presentation/features/tankfarm/TankFarmPage')) },
      { path: 'traceability', lazy: page(() => import('@/presentation/features/traceability/TraceabilityPage')) },
      { path: 'traceability/:id', lazy: page(() => import('@/presentation/features/traceability/LotPage')) },
      { path: 'integration', lazy: page(() => import('@/presentation/features/integration/IntegrationPage')) },
      { path: 'menu/:id', lazy: page(() => import('@/presentation/features/menu/FolderPage')) },
      { path: 'coverage', lazy: page(() => import('@/presentation/features/coverage/CoveragePage')) },
      { path: 'analytics', lazy: page(() => import('@/presentation/features/analytics/GroupAnalytics')) },
      { path: 'mrp/planning', lazy: page(() => import('@/presentation/features/planning/PlanningBoard')) },
      { path: '*', Component: NotFound },
    ],
  },
])
