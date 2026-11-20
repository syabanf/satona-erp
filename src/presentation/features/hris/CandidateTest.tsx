import { useParams } from 'react-router'
import { testIdOf } from '@/domain/assessments'
import type { Values } from '@/domain/records'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { refTitle } from '../../records/text'
import { BrandMark } from '../../ui/BrandMark'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { TestRunner } from './PsikotesTake'

/** A candidate's test from the link HR sent: no account, no menu, only this one test. */
export default function CandidateTest() {
  const { token = '' } = useParams()
  const all = useAllRecords()
  const { records } = useServices()
  const id = testIdOf(token)
  const test = id ? all.data?.['hrs.psikotes']?.find((t) => t.id === id) : undefined
  return (
    <div className="min-h-dvh bg-canvas px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-center gap-3">
          <BrandMark className="h-6" />
          <span className="text-sm text-muted">Tes rekrutmen</span>
        </header>
        {!all.data ? (
          <CardSkeleton lines={8} />
        ) : !test ? (
          <EmptyState title="Tautan tes tidak berlaku">Minta tautan baru ke tim rekrutmen.</EmptyState>
        ) : (
          <TestRunner test={test} candidate={refTitle('hrs.candidates', String(test.values.candidate), all.data).split(' · ')[0]!} act={(values: Values, to) => records.candidateTest(test.id, values, to)} />
        )}
      </div>
    </div>
  )
}
