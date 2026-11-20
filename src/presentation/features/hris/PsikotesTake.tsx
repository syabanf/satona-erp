import { useRef, useState, type PointerEvent } from 'react'
import { useParams } from 'react-router'
import { Eraser, Link2, Send } from 'lucide-react'
import { INSTRUMENTS, scoreChoices, testToken, WORK_SCALES, workStyleProfile } from '@/domain/assessments'
import type { ErpRecord, Values } from '@/domain/records'
import { typeOf } from '@/domain/catalog'
import { useAllRecords } from '../../hooks/useRecords'
import { useServices } from '../../hooks/useServices'
import { useSession } from '../../hooks/useSession'
import { useStored } from '../../hooks/useStored'
import { StateBadge } from '../../records/StateBadge'
import { refTitle } from '../../records/text'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { ChoiceList } from '../../ui/ChoiceList'
import { PageBar } from '../../ui/PageBar'
import { CardSkeleton, EmptyState } from '../../ui/States'
import { useToast } from '../../ui/useToast'

const TYPE = typeOf('hrs.psikotes')!

/** A drawing pad for projective tests: pointer strokes on a white canvas, saved as a PNG data URL. */
function DrawingPad({ onChange, initial }: { onChange: (png: string) => void; initial?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - box.left) / box.width) * e.currentTarget.width, ((e.clientY - box.top) / box.height) * e.currentTarget.height] as const
  }
  const ctx = () => {
    const c = canvas.current!.getContext('2d')!
    Object.assign(c, { lineWidth: 3, lineCap: 'round', lineJoin: 'round', strokeStyle: '#101112' })
    return c
  }
  return (
    <div>
      <canvas
        ref={(el) => {
          canvas.current = el
          if (el && initial && !el.dataset.loaded) {
            el.dataset.loaded = '1'
            const img = new Image()
            img.onload = () => el.getContext('2d')!.drawImage(img, 0, 0)
            img.src = initial
          }
        }}
        width={720}
        height={480}
        aria-label="Kanvas gambar"
        className="aspect-[3/2] w-full touch-none rounded-panel border border-line-strong bg-white"
        onPointerDown={(e) => {
          drawing.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          const [x, y] = point(e)
          ctx().beginPath()
          ctx().moveTo(x, y)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const [x, y] = point(e)
          const c = ctx()
          c.lineTo(x, y)
          c.stroke()
        }}
        onPointerUp={() => {
          drawing.current = false
          onChange(canvas.current!.toDataURL('image/png'))
        }}
      />
      <Button
        size="sm"
        variant="card"
        className="mt-2"
        onClick={() => {
          canvas.current!.getContext('2d')!.clearRect(0, 0, 720, 480)
          onChange('')
        }}
      >
        <Eraser aria-hidden className="size-4" /> Hapus gambar
      </Button>
    </div>
  )
}

/**
 * The test screen, for HR beside a candidate or for the candidate alone from a link. Arithmetic is scored at once; the
 * work-style inventory shows a profile per scale; the drawing tests keep the drawing on this device for the
 * psychologist. `act` saves the answer fields and takes the step; finishing moves the test to Done.
 */
export function TestRunner({ test, candidate, act }: { test: ErpRecord; candidate: string; act: (values: Values, to: 'in_progress' | 'done') => Promise<unknown> }) {
  const toast = useToast()
  const [answers, setAnswers] = useState<(number | undefined)[]>([])
  const [drawings, setDrawings] = useStored<Record<string, string>>('wit-psikotes-drawings', {})
  const [busy, setBusy] = useState(false)
  const instrument = INSTRUMENTS[String(test.values.instrument)]
  if (!instrument) return <EmptyState title={`Alat tes ${String(test.values.instrument)} belum punya soal`} />
  const finished = ['done', 'reviewed'].includes(test.status)
  const complete = instrument.kind === 'drawing' ? Boolean(drawings[test.id]) : instrument.items.every((_, i) => answers[i] !== undefined)
  const profile = instrument.kind === 'inventory' ? workStyleProfile(answers) : []

  const step = (to: 'in_progress' | 'done', values: Values = {}) => act(values, to)
  const start = async () => {
    setBusy(true)
    try {
      await step('in_progress')
    } catch (e) {
      toast({ tone: 'danger', title: 'Tes tidak dimulai', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  const finish = async () => {
    setBusy(true)
    try {
      if (instrument.kind === 'choice') {
        const score = scoreChoices(instrument.items, answers)
        await step('done', { score })
        toast({ title: `Tes selesai, skor ${score}` })
      } else if (instrument.kind === 'inventory') {
        await step('done', { notes: `Profil gaya kerja: ${profile.map((p) => `${p.scale} ${p.share}%`).join(', ')}` })
        toast({ title: 'Inventori selesai', description: 'Profil tersimpan di catatan tes untuk dinilai.' })
      } else {
        await step('done')
        toast({ title: 'Gambar tersimpan', description: 'Psikolog menilainya dari halaman tes ini.' })
      }
    } catch (e) {
      toast({ tone: 'danger', title: 'Tes tidak tersimpan', description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={`${String(test.values.instrument)} · ${candidate}`} action={<StateBadge type={TYPE} status={test.status} />} />
        <p className="text-sm text-muted">{instrument.intro}</p>
        {test.status === 'pending' && (
          <Button variant="accent" className="mt-4" loading={busy} onClick={start}>
            Mulai tes
          </Button>
        )}
      </Card>

      {test.status === 'in_progress' && (
        <Card>
          {instrument.kind === 'drawing' ? (
            <>
              <p className="mb-3 font-medium">{instrument.prompt}</p>
              <DrawingPad initial={drawings[test.id]} onChange={(png) => setDrawings({ ...drawings, [test.id]: png })} />
            </>
          ) : (
            <ChoiceList items={instrument.items} answers={answers} onAnswer={(i, o) => setAnswers((a) => Object.assign([...a], { [i]: o }))} />
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted">{instrument.kind === 'drawing' ? (complete ? 'Gambar siap dikirim' : 'Belum ada gambar') : `${answers.filter((a) => a !== undefined).length} dari ${instrument.items.length} terjawab`}</span>
            <Button variant="accent" className="ml-auto" disabled={!complete} loading={busy} onClick={finish}>
              <Send aria-hidden className="size-4" /> Selesai dan kirim
            </Button>
          </div>
        </Card>
      )}

      {finished && (
        <Card>
          <CardHeader title="Hasil" />
          {instrument.kind === 'drawing' ? (
            drawings[test.id] ? <img src={drawings[test.id]} alt={`Gambar ${String(test.values.instrument)} ${candidate}`} className="w-full rounded-panel border border-line" /> : <p className="text-sm text-muted">Gambar disimpan di perangkat lain.</p>
          ) : instrument.kind === 'inventory' ? (
            <p className="text-sm whitespace-pre-wrap">{String(test.values.notes || 'Profil belum tercatat.')}</p>
          ) : (
            <p className="text-3xl font-medium tabular">{String(test.values.score ?? '-')}<span className="ml-1 text-base text-muted">dari 100</span></p>
          )}
          {instrument.kind === 'inventory' && profile.some((p) => p.share) && (
            <ul className="mt-3 space-y-2">
              {profile.map((p) => (
                <li key={p.scale} className="text-sm">
                  <span className="flex justify-between">{p.scale}<span className="tabular">{p.share}%</span></span>
                  <span className="mt-1 block h-1.5 rounded-full bg-control"><span className="block h-full rounded-full bg-invert" style={{ width: `${p.share}%` }} /></span>
                </li>
              ))}
            </ul>
          )}
          {instrument.kind === 'inventory' && <p className="mt-3 text-xs text-muted">Skala inventori: {WORK_SCALES.join(', ')}.</p>}
        </Card>
      )}
    </div>
  )
}

/** HR's view of a candidate's test, with a link the candidate can open without an account. */
export default function PsikotesTake() {
  const { id = '' } = useParams()
  const all = useAllRecords()
  const { records } = useServices()
  const { role } = useSession()
  const toast = useToast()
  if (!all.data) return <CardSkeleton lines={8} />
  const test = all.data[TYPE.key]?.find((t) => t.id === id)
  if (!test) return <EmptyState title={`Tes ${id} tidak ditemukan`} />
  const link = `${window.location.origin}/test/${testToken(test.id)}`
  const act = async (values: Values, to: string) => {
    if (Object.keys(values).length) await records.update(role, TYPE.key, test.id, { ...test.values, ...values })
    await records.transition(role, TYPE.key, test.id, to)
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageBar
        fallback="/hris/psikotes"
        label="Daftar psikotes"
        actions={
          <Button
            variant="card"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link)
                toast({ title: 'Tautan tes disalin', description: 'Kirim ke kandidat; tautan ini tidak butuh login.' })
              } catch {
                toast({ title: 'Tautan tes', description: link })
              }
            }}
          >
            <Link2 aria-hidden className="size-4" /> Salin tautan kandidat
          </Button>
        }
      />
      <TestRunner test={test} candidate={refTitle('hrs.candidates', String(test.values.candidate), all.data).split(' · ')[0]!} act={act} />
    </div>
  )
}
