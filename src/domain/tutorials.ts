/** The quick tour and the step-by-step tutorials behind "Tutorial penggunaan". Pure data plus route resolution. */
import { typesOf } from './catalog'
import type { Role } from './erp'
import { homeFor } from './menu'

/** Where a step happens: the role's home, its first worklist, the approvals inbox, or a fixed path. */
export type StepRoute = 'home' | 'list' | 'approvals' | `/${string}`

export interface TutorialStep {
  /** `data-tour` value of the element to highlight; without one the step shows as a centred card. */
  target?: string
  route?: StepRoute
  title: string
  body: string
}

export interface Tutorial {
  id: string
  title: string
  summary: string
  minutes: number
  steps: readonly TutorialStep[]
}

export const QUICK_TOUR: Tutorial = {
  id: 'tour',
  title: 'Tur singkat',
  summary: 'Kenali bagian utama layar dalam satu menit.',
  minutes: 1,
  steps: [
    { route: 'home', title: 'Selamat datang di Satona ERP', body: 'Satu sistem untuk holding, logistik, pupuk dan kimia. Tur ini menunjukkan tempat semua hal penting.' },
    { target: 'workspace', title: 'Perusahaan aktif', body: 'Anda bekerja di Satona Group. Klik untuk berpindah konteks perusahaan atau membuka aplikasi ponsel.' },
    { target: 'search', title: 'Cari apa saja', body: 'Ketik nomor dokumen, nama, atau kode transaksi seperti TRP01. Tekan ⌘K atau / dari halaman mana pun.' },
    { target: 'tasks', title: 'Tugas saya', body: 'Pekerjaan yang paling sering Anda lakukan, disusun sesuai peran Anda.' },
    { target: 'menu', title: 'Semua menu', body: 'Menu lengkap per perusahaan dan modul. Klik folder untuk membuka halaman kartu fiturnya.' },
    { target: 'alerts', title: 'Perlu perhatian', body: 'Peringatan dari pabrik, armada dan tangki. Klik satu peringatan untuk langsung ke datanya.' },
    { target: 'role', title: 'Ganti peran', body: 'Coba sistem sebagai direktur, operator, sopir atau vendor. Menu dan hak akses ikut berubah.' },
    { target: 'help', title: 'Bantuan kapan saja', body: 'Buka Tutorial penggunaan lagi untuk tur ini atau panduan langkah demi langkah.' },
  ],
}

export const TUTORIALS: readonly Tutorial[] = [
  {
    id: 'create',
    title: 'Membuat data baru',
    summary: 'Isi formulir di jendela modal tanpa meninggalkan daftar.',
    minutes: 1,
    steps: [
      { route: 'list', target: 'record-new', title: 'Tombol data baru', body: 'Setiap daftar punya tombol ini. Tekan N di keyboard untuk hasil yang sama.' },
      { target: 'record-table', title: 'Daftar tetap terlihat', body: 'Formulir terbuka di atas daftar. Tanggal dan entitas terisi otomatis sesuai peran Anda.' },
      { title: 'Simpan, lalu lanjutkan', body: 'Setelah disimpan, data baru terbuka di panel samping. Dari sana Anda bisa mengajukan, mengubah atau menghapusnya.' },
    ],
  },
  {
    id: 'filter',
    title: 'Mencari dan memfilter',
    summary: 'Saring daftar berdasarkan status, kata, periode atau kolom apa pun.',
    minutes: 2,
    steps: [
      { route: 'list', target: 'record-status', title: 'Filter status', body: 'Klik status untuk melihat datanya saja. Angka di tiap chip menunjukkan jumlahnya.' },
      { target: 'record-search', title: 'Cari kata', body: 'Cari nomor, nama atau isi kolom mana pun di daftar ini.' },
      { target: 'record-filters', title: 'Filter setiap kolom', body: 'Buka Filters untuk menyaring per kolom: pilihan, rentang angka, rentang tanggal atau kata.' },
      { target: 'record-table', title: 'Filter tersimpan di alamat', body: 'Bagikan tautan halaman ini dan rekan Anda melihat hasil filter yang sama. Ekspor CSV mengikuti filter.' },
    ],
  },
  {
    id: 'approve',
    title: 'Menyetujui dokumen',
    summary: 'Periksa antrean persetujuan bertingkat dan tanda tangani.',
    minutes: 1,
    steps: [
      { route: 'approvals', title: 'Kotak persetujuan', body: 'Semua dokumen yang menunggu tanda tangan Anda, dari semua modul, ada di sini.' },
      { target: 'approvals-list', title: 'Level persetujuan', body: 'Label "Level n dari m" menunjukkan posisi Anda di rantai persetujuan. Setujui atau tolak langsung dari baris.' },
      { title: 'Delegasi', body: 'Saat Anda cuti, delegasi yang aktif mengizinkan pengganti menandatangani atas nama Anda.' },
    ],
  },
  {
    id: 'navigate',
    title: 'Menu dan kode transaksi',
    summary: 'Pakai menu bergaya SAP dan kode cepat seperti TRP01.',
    minutes: 1,
    steps: [
      { route: 'home', target: 'menu', title: 'Buka Semua menu', body: 'Menu tersusun per perusahaan, modul, lalu data utama, transaksi, laporan dan konfigurasi.' },
      { target: 'search', title: 'Kode transaksi', body: 'Akhiran 01 membuat data baru, 02 membuka daftar, 05 membuka antrean persetujuan. Contoh: TRP01 membuat trip.' },
      { title: 'Favorit', body: 'Arahkan ke item menu lalu klik bintang. Favorit muncul paling atas dan tersimpan di perangkat ini.' },
    ],
  },
]

export const ALL_TUTORIALS: readonly Tutorial[] = [QUICK_TOUR, ...TUTORIALS]

/** The page a step opens for this role, or undefined when the step stays where the user is. */
export function stepPath(route: StepRoute | undefined, role: Pick<Role, 'id' | 'name' | 'module' | 'external'>): string | undefined {
  if (!route) return undefined
  if (route === 'home') return homeFor(role)
  if (route === 'approvals') return '/approvals'
  if (route === 'list') {
    const types = typesOf(role.module)
    const first = types.find((t) => t.area === 'transaction') ?? types[0]
    return first ? `/modules/${first.module}/${first.key.split('.')[1]}` : homeFor(role)
  }
  return route
}
