import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Camera, CameraOff, Keyboard, ScanLine } from 'lucide-react'
import { RECORD_TYPES } from '@/domain/catalog'
import { useAllRecords } from '../../hooks/useRecords'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { Input } from '../../ui/Field'
import { recordPath } from '../../records/text'

interface Detector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => Detector
  }
}

/**
 * Scans a QR or barcode with the phone camera (the browser's BarcodeDetector) and opens what it names: a link printed
 * by Label QR, or a record id such as SP-0004. Without camera support the same lookup takes a typed code.
 */
export default function ScanPage() {
  const navigate = useNavigate()
  const all = useAllRecords()
  const video = useRef<HTMLVideoElement>(null)
  const [on, setOn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const supported = typeof window !== 'undefined' && Boolean(window.BarcodeDetector)

  // A scanned value opens the record it names: our own link, or an id whose prefix belongs to a record type.
  const open = (raw: string) => {
    const value = raw.trim()
    try {
      const url = new URL(value)
      if (url.origin === window.location.origin) return navigate(url.pathname + url.search)
    } catch {
      /* not a link */
    }
    const id = value.toUpperCase()
    const type = RECORD_TYPES.find((t) => id.startsWith(`${t.prefix}-`) && all.data?.[t.key]?.some((r) => r.id === id))
    if (type) return navigate(recordPath(type, id))
    setError(`Kode "${value}" tidak cocok dengan data mana pun.`)
  }

  useEffect(() => {
    if (!on || !window.BarcodeDetector) return
    let stream: MediaStream | undefined
    let timer = 0
    const detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'code_39'] })
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        if (!video.current) return
        video.current.srcObject = s
        void video.current.play()
        timer = window.setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return
          const [hit] = await detector.detect(video.current).catch(() => [])
          if (hit) {
            setOn(false)
            open(hit.rawValue)
          }
        }, 400)
      })
      .catch(() => {
        setError('Kamera tidak bisa dibuka. Izinkan akses kamera di browser, atau ketik kodenya di bawah.')
        setOn(false)
      })
    return () => {
      window.clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
    // `open` reads the latest records each time it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (code.trim()) open(code)
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardHeader title="Pindai QR atau barcode" icon={<ScanLine aria-hidden className="size-5 text-muted" />} />
        <div className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-panel bg-ink text-on-ink">
          <video ref={video} muted playsInline className={on ? 'absolute inset-0 size-full object-cover' : 'hidden'} />
          {on && <span aria-hidden className="absolute inset-[18%] rounded-2xl border-2 border-accent shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" />}
          {!on && (
            <div className="p-6 text-center">
              <Camera aria-hidden className="mx-auto size-10 opacity-60" />
              <p className="mt-3 text-sm opacity-80">{supported ? 'Arahkan kamera ke label QR aset, lot atau suku cadang.' : 'Browser ini belum mendukung pemindaian kamera. Pakai Chrome di Android, atau ketik kodenya di bawah.'}</p>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {supported && (
            <Button variant={on ? 'card' : 'accent'} onClick={() => (setError(null), setOn(!on))}>
              {on ? <CameraOff aria-hidden className="size-4" /> : <Camera aria-hidden className="size-4" />} {on ? 'Matikan kamera' : 'Nyalakan kamera'}
            </Button>
          )}
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </Card>
      <Card>
        <CardHeader title="Ketik kode" icon={<Keyboard aria-hidden className="size-5 text-muted" />} />
        <form onSubmit={submit} className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Misal: SP-0004 atau AST-0007" aria-label="Kode data" className="flex-1" />
          <Button type="submit" variant="solid">
            Buka
          </Button>
        </form>
      </Card>
    </div>
  )
}
