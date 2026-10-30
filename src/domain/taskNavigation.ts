import { type Role, type Access } from './erp'
import { canCreate } from './records'
import { typeOf, typesOf } from './catalog'
import { recordLabel } from './uiLabels'

export interface TaskShortcut {
  id: string
  title: string
  detail: string
  to: string
  module?: string
  createType?: string
  keywords: string
}

const TASKS: readonly TaskShortcut[] = [
  { id: 'approvals', title: 'Periksa persetujuan', detail: 'Putuskan pengajuan yang menunggu', to: '/approvals', keywords: 'approval approve reject review requests setujui tolak persetujuan pengajuan keputusan' },
  { id: 'alarms', title: 'Periksa alarm', detail: 'Lihat masalah yang perlu ditangani', to: '/modules/occ/alarms', module: 'occ', keywords: 'check active alarms alert peringatan gangguan masalah operasi' },
  { id: 'checkin', title: 'Periksa kendaraan', detail: 'Isi pemeriksaan sebelum jalan atau di gerbang', to: '/fleet/checkin', module: 'tms', keywords: 'check a vehicle check in checkin sopir driver p2h gerbang inspeksi' },
  { id: 'trips', title: 'Lihat perjalanan', detail: 'Pantau tugas pengiriman', to: '/modules/tms/trips', module: 'tms', keywords: 'see trips trip pengiriman armada transportasi' },
  { id: 'purchase-request', title: 'Ajukan pembelian', detail: 'Buat permintaan pembelian', to: '/modules/vms/requisitions/new', module: 'vms', createType: 'vms.requisitions', keywords: 'request a purchase buat beli pesan pesanan pengadaan barang requisition pr' },
  { id: 'purchase-orders', title: 'Lihat pesanan pembelian', detail: 'Cari pesanan ke pemasok', to: '/modules/vms/orders', module: 'vms', keywords: 'see purchase orders po vendor supplier order' },
  { id: 'leave', title: 'Lihat pengajuan cuti', detail: 'Periksa cuti karyawan', to: '/modules/hrs/leaves', module: 'hrs', keywords: 'see leave requests izin leave pegawai absensi' },
  { id: 'permits', title: 'Lihat izin kerja', detail: 'Periksa izin keselamatan', to: '/modules/she/permits', module: 'she', keywords: 'see work permits permit keselamatan k3 safety' },
  { id: 'maintenance', title: 'Lihat pekerjaan perawatan', detail: 'Buka tugas perawatan alat', to: '/modules/eam/workorders', module: 'eam', keywords: 'see maintenance jobs pemeliharaan mesin alat work order maintenance' },
  { id: 'production', title: 'Lihat pekerjaan produksi', detail: 'Buka tugas di lantai produksi', to: '/modules/mes/workorders', module: 'mes', keywords: 'see production jobs pabrik kerja mesin work order' },
  { id: 'sales', title: 'Lihat pesanan pelanggan', detail: 'Pantau pesanan penjualan', to: '/modules/dms/orders', module: 'dms', keywords: 'see sales orders penjualan customer sales order' },
  { id: 'modules', title: 'Cari modul', detail: 'Lihat semua bagian yang bisa dibuka', to: '/modules', keywords: 'find a module menu fitur halaman aplikasi' },
]

export function availableTasks(role: Pick<Role, 'id' | 'external'>, accessFor: (module: string) => Access, approvals: number): TaskShortcut[] {
  return TASKS.filter((task) => {
    if (task.id === 'approvals') return approvals > 0
    if (task.id === 'modules') return !role.external
    if (!task.module || accessFor(task.module) === 'none') return false
    if (!task.createType) return true
    const type = typeOf(task.createType)
    return Boolean(type && canCreate(type, accessFor(task.module)))
  })
}

export function suggestedTasks(role: Pick<Role, 'id' | 'module' | 'external'>, accessFor: (module: string) => Access, approvals: number): TaskShortcut[] {
  const available = availableTasks(role, accessFor, approvals)
  if (role.id === 'admin') return ['approvals', 'alarms', 'checkin', 'modules'].map((id) => available.find((task) => task.id === id)).filter((task): task is TaskShortcut => Boolean(task))

  const relevant = available.filter((task) => task.module === role.module || task.id === 'approvals')
  if (accessFor(role.module) !== 'none') {
    const own = typesOf(role.module).toSorted((a, b) => Number(b.area === 'transaction') - Number(a.area === 'transaction'))
    for (const type of own) {
      if (relevant.length >= 3) break
      const path = `/modules/${role.module}/${type.key.split('.')[1]}`
      if (relevant.some((task) => task.to.startsWith(path))) continue
      relevant.push({ id: `worklist-${type.key}`, title: `Lihat ${recordLabel(type.key, type.name.toLowerCase())}`, detail: 'Buka daftar pekerjaan', to: path, module: role.module, keywords: type.name.toLowerCase() })
    }
  }
  const modules = available.find((task) => task.id === 'modules')
  if (modules) relevant.push(modules)
  return relevant.slice(0, 4)
}

export function searchTasks(tasks: readonly TaskShortcut[], query: string, limit = 5): TaskShortcut[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter((word) => word && !/^(saya|ingin|mau|tolong|cari|lihat|buka|cek|periksa|show|open|find)$/.test(word))
  if (!words.length) return []
  return tasks.filter((task) => words.every((word) => `${task.title} ${task.detail} ${task.keywords}`.toLowerCase().includes(word))).slice(0, limit)
}
