import { useState } from 'react'
import { Camera, Save } from 'lucide-react'
import { useSession } from '../../hooks/useSession'
import { useStored } from '../../hooks/useStored'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { Card, CardHeader } from '../../ui/Card'
import { Input } from '../../ui/Field'
import { Switch } from '../../ui/Switch'
import { useToast } from '../../ui/useToast'

const EVENTS = [
  ['approvals', 'Persetujuan menunggu saya'],
  ['mentions', 'Disebut dalam komentar'],
  ['alarms', 'Alarm mesin dan SCADA'],
  ['pm', 'PM jatuh tempo'],
  ['stock', 'Stok di bawah minimum'],
] as const
const CHANNELS = [
  ['app', 'Di aplikasi'],
  ['email', 'Email'],
  ['wa', 'WhatsApp'],
] as const

interface Profile {
  name: string
  email: string
  phone: string
  photo: string
  notify: Record<string, boolean>
}

/**
 * The signed-in person's profile: name, contact, photo, and which events reach them on which channel. Kept per role on
 * this device; email and WhatsApp delivery need the backend and are recorded as preferences for now.
 */
export default function ProfilePage() {
  const { role } = useSession()
  const toast = useToast()
  const [saved, setSaved] = useStored<Profile>(`wit-profile:${role.id}`, { name: role.name, email: '', phone: '', photo: '', notify: { 'approvals:app': true, 'mentions:app': true, 'alarms:app': true } })
  const [draft, setDraft] = useState(saved)
  const set = (patch: Partial<Profile>) => setDraft((d) => ({ ...d, ...patch }))

  const photo = (file?: File) => {
    if (!file) return
    if (file.size > 1024 * 1024) return toast({ tone: 'danger', title: 'Foto terlalu besar', description: 'Pilih foto di bawah 1 MB.' })
    const reader = new FileReader()
    reader.onload = () => set({ photo: String(reader.result) })
    reader.readAsDataURL(file)
  }

  return (
    <form
      className="grid max-w-5xl gap-4 lg:grid-cols-[1fr_1.4fr]"
      onSubmit={(e) => {
        e.preventDefault()
        setSaved(draft)
        toast({ title: 'Profil disimpan' })
      }}
    >
      <Card>
        <CardHeader title="Data diri" />
        <div className="flex items-center gap-4">
          {draft.photo ? <img src={draft.photo} alt="Foto profil" className="size-20 rounded-full object-cover" /> : <Avatar name={draft.name || role.name} size="lg" />}
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-medium hover:bg-raised">
            <Camera aria-hidden className="size-4" /> Ganti foto
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => photo(e.target.files?.[0])} />
          </label>
          {draft.photo && (
            <Button variant="ghost" size="sm" onClick={() => set({ photo: '' })}>
              Hapus
            </Button>
          )}
        </div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium">
            Nama tampilan
            <Input className="mt-1.5" value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="block text-sm font-medium">
            Email kerja
            <Input className="mt-1.5" type="email" value={draft.email} onChange={(e) => set({ email: e.target.value })} placeholder="nama@perusahaan.com" />
          </label>
          <label className="block text-sm font-medium">
            Nomor WhatsApp
            <Input className="mt-1.5" type="tel" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="0812…" />
          </label>
          <p className="rounded-panel bg-raised p-3 text-xs text-muted">
            Peran: <span className="font-semibold text-fg">{role.name}</span>. Ganti peran dari kartu akun di kiri bawah.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Notifikasi" action={<span className="text-xs text-muted">pilih kanal per kejadian</span>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 font-medium">Kejadian</th>
                {CHANNELS.map(([, label]) => (
                  <th key={label} className="py-2 text-center font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {EVENTS.map(([event, label]) => (
                <tr key={event}>
                  <td className="py-3">{label}</td>
                  {CHANNELS.map(([channel, cl]) => (
                    <td key={channel} className="py-3 text-center">
                      <Switch className="mx-auto" checked={Boolean(draft.notify[`${event}:${channel}`])} onChange={(on) => set({ notify: { ...draft.notify, [`${event}:${channel}`]: on } })} label={`${label} lewat ${cl}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">Notifikasi di aplikasi muncul di lonceng kanan atas. Email dan WhatsApp mulai terkirim saat sistem tersambung ke server.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={() => setDraft(saved)}>
            Batalkan
          </Button>
          <Button variant="accent" type="submit">
            <Save aria-hidden className="size-4" /> Simpan profil
          </Button>
        </div>
      </Card>
    </form>
  )
}
