import { useState } from 'react'
import { useParams } from 'react-router'
import { Award, BookOpen, CheckCircle2, Circle } from 'lucide-react'
import { courseContent, scoreChoices } from '@/domain/assessments'
import { cn } from '@/lib/cn'
import { useMe } from '../../hooks/useMe'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { StateBadge } from '../../records/StateBadge'
import { selfPath } from '@/domain/selfService'
import { typeOf } from '@/domain/catalog'
import type { Values } from '@/domain/records'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { ChoiceList } from '../../ui/ChoiceList'
import { PageBar } from '../../ui/PageBar'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { useToast } from '../../ui/useToast'

const TYPE = typeOf('hrs.enrollments')!

/**
 * One assigned course: its lessons in order, then the quiz. Reading a lesson moves the progress; passing the quiz at the
 * course's pass mark completes the enrolment and issues the certificate for the course's validity.
 */
export default function CoursePage() {
  const { id = '' } = useParams()
  const { all, me } = useMe()
  const { records, clock } = useServices()
  const { role } = useSession()
  const toast = useToast()
  const [lesson, setLesson] = useState(0)
  const [answers, setAnswers] = useState<(number | undefined)[]>([])
  const [result, setResult] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  if (!all) return <CardSkeleton lines={8} />
  const enrolment = all[TYPE.key]?.find((e) => e.id === id)
  if (!enrolment || !me || enrolment.values.employee !== me.id) return <EmptyState title="Kursus tidak ditemukan">Kursus ini tidak ditugaskan kepada Anda.</EmptyState>
  const course = all['hrs.courses']?.find((c) => c.id === enrolment.values.course)
  const title = String(course?.values.title ?? enrolment.values.course)
  const content = courseContent(title)
  const passMark = Number(course?.values.passMark) || 70
  const steps = content.lessons.length + 1
  const done = enrolment.status === 'completed'

  const save = async (patch: Values, to?: string) => {
    if (enrolment.status === 'assigned' && to !== 'in_progress') await records.updateOwn(role, TYPE.key, enrolment.id, {}, 'in_progress')
    return records.updateOwn(role, TYPE.key, enrolment.id, patch, to)
  }
  const open = async (index: number) => {
    setLesson(index)
    // Reading caps short of 100%: only a passed quiz completes the course.
    const progress = Math.round((Math.min(index + 1, content.lessons.length) / steps) * 100)
    if (done || progress <= (Number(enrolment.values.progress) || 0)) return
    try {
      await save({ progress }, enrolment.status === 'assigned' ? 'in_progress' : undefined)
    } catch (e) {
      toast({ tone: 'danger', title: 'Progres tidak tersimpan', description: e instanceof Error ? e.message : String(e) })
    }
  }
  const submit = async () => {
    const score = scoreChoices(content.quiz, answers)
    setResult(score)
    if (score < passMark) return toast({ tone: 'danger', title: `Skor ${score}, belum lulus`, description: `Nilai lulus ${passMark}. Baca ulang materinya lalu coba lagi.` })
    setBusy(true)
    try {
      const months = Number(course?.values.validity) || 0
      const until = months ? new Date(Date.UTC(Number(clock.today().slice(0, 4)), Number(clock.today().slice(5, 7)) - 1 + months, Number(clock.today().slice(8)))).toISOString().slice(0, 10) : ''
      await save({ progress: 100, score, validUntil: until }, 'completed')
      toast({ title: `Lulus dengan skor ${score}`, description: until ? `Sertifikat berlaku sampai ${until}.` : 'Kursus selesai.' })
    } catch (e) {
      toast({ tone: 'danger', title: 'Hasil tidak tersimpan', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageBar fallback={selfPath('courses')} label="Kursus saya" />
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader title={title} action={<StateBadge type={TYPE} status={enrolment.status} />} />
          <p className="mb-3 text-xs text-muted">Progres {Number(enrolment.values.progress) || 0}% · nilai lulus {passMark}</p>
          <ol className="space-y-1">
            {[...content.lessons.map((l) => l.title), 'Kuis akhir'].map((name, i) => {
              const read = done || ((Number(enrolment.values.progress) || 0) >= Math.round(((i + 1) / steps) * 100))
              return (
                <li key={name}>
                  <button type="button" onClick={() => open(i)} aria-current={lesson === i ? 'step' : undefined} className={cn('flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-xl px-2 text-left text-sm', lesson === i ? 'bg-accent-soft text-accent-text' : 'hover:bg-raised')}>
                    {read ? <CheckCircle2 aria-hidden className="size-4 shrink-0 text-success" /> : <Circle aria-hidden className="size-4 shrink-0 text-subtle" />}
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </Card>
        <Card>
          {lesson < content.lessons.length ? (
            <>
              <CardHeader title={content.lessons[lesson]!.title} icon={<BookOpen aria-hidden className="size-5 text-muted" />} />
              <p className="text-[15px] leading-relaxed text-body">{content.lessons[lesson]!.body}</p>
              <Button variant="accent" className="mt-5" onClick={() => open(lesson + 1)}>
                {lesson + 1 < content.lessons.length ? 'Bagian berikutnya' : 'Lanjut ke kuis'}
              </Button>
            </>
          ) : done ? (
            <div className="text-center">
              <Award aria-hidden className="mx-auto size-12 text-success" />
              <p className="mt-2 text-lg font-semibold">Kursus selesai</p>
              <p className="text-sm text-muted">Skor {String(enrolment.values.score ?? '-')}{enrolment.values.validUntil ? ` · sertifikat berlaku sampai ${String(enrolment.values.validUntil)}` : ''}</p>
            </div>
          ) : (
            <>
              <CardHeader title="Kuis akhir" />
              <ChoiceList items={content.quiz} answers={answers} reveal={result !== null && result >= passMark} onAnswer={(i, o) => { setResult(null); setAnswers((a) => Object.assign([...a], { [i]: o })) }} />
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {result !== null && <span className={cn('text-sm font-semibold', result >= passMark ? 'text-success' : 'text-accent-text')}>Skor {result}</span>}
                <Button variant="accent" className="ml-auto" disabled={content.quiz.some((_, i) => answers[i] === undefined)} loading={busy} onClick={submit}>
                  Kirim jawaban
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
