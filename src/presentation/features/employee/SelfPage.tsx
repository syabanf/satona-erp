import { useParams } from 'react-router'
import { selfItem } from '@/domain/selfService'
import { useMe } from '../../hooks/useMe'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { NotFound } from '../NotFound'
import { Attendance } from './Attendance'
import { OwnRecords } from './OwnRecords'
import { Payslips } from './Payslips'
import { Team } from './Team'
import { TeamApprovals } from './TeamApprovals'

/** One page of the employee area, picked by the section in the URL. */
export default function SelfPage() {
  const { section = '' } = useParams()
  const { all, me } = useMe()
  const item = selfItem(section)
  if (!item?.id) return <NotFound />
  if (!all) return <CardSkeleton lines={8} />
  if (!me) return <EmptyState title="Data karyawan belum ada">Minta HR mendaftarkan Anda di data karyawan.</EmptyState>
  if (section === 'attendance') return <Attendance all={all} me={me} />
  if (section === 'payslips') return <Payslips all={all} me={me} />
  if (section === 'team') return <Team item={item} all={all} me={me} />
  if (section === 'approvals') return <TeamApprovals all={all} me={me} />
  return <OwnRecords key={section} item={item} all={all} me={me} />
}
