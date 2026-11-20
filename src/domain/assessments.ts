/**
 * The content behind two record types that used to be status only: psychometric test items and their scoring, and the
 * lessons and quiz of each course. Plain data plus scoring, so the screens and the tests read the same rules.
 */

export interface Choice {
  q: string
  options: readonly string[]
  /** Index of the right option; absent where no answer is right, as in a preference inventory. */
  answer?: number
}

/** Ten arithmetic items, scored as the share answered right. */
const ARITHMETIC: readonly Choice[] = [
  { q: '125 + 378 =', options: ['493', '503', '513', '403'], answer: 1 },
  { q: '1.000 − 437 =', options: ['563', '573', '663', '537'], answer: 0 },
  { q: '24 × 15 =', options: ['340', '350', '360', '370'], answer: 2 },
  { q: '144 : 12 =', options: ['11', '12', '13', '14'], answer: 1 },
  { q: '15% dari 240 =', options: ['24', '30', '36', '40'], answer: 2 },
  { q: 'Deret 3, 6, 12, 24, …', options: ['36', '42', '48', '30'], answer: 2 },
  { q: 'Satu batch 40 t butuh 6 t KCl. Batch 100 t butuh … t', options: ['12', '15', '16', '24'], answer: 1 },
  { q: 'Truk 8 t mengangkut 52 t. Perlu berapa rit?', options: ['6', '7', '8', '9'], answer: 1 },
  { q: '0,25 + 0,5 × 2 =', options: ['1,25', '1,5', '0,75', '1'], answer: 0 },
  { q: 'Harga naik dari 80 ke 100. Kenaikannya …%', options: ['20', '25', '80', '125'], answer: 1 },
]

/** The work-style scales a forced-choice inventory reports, in the order the statements below point at. */
export const WORK_SCALES = ['Kepemimpinan', 'Ketelitian', 'Kerja tim', 'Dorongan berprestasi', 'Ketahanan kerja'] as const

/**
 * Forced-choice pairs in the PAPI style: each option raises one work-style scale. There is no right answer; the
 * profile shows which scales a candidate leans to.
 */
const WORK_STYLE: ReadonlyArray<Choice & { scales: readonly [number, number] }> = [
  { q: 'Mana yang lebih menggambarkan Anda?', options: ['Saya suka mengarahkan orang lain', 'Saya suka memeriksa detail pekerjaan'], scales: [0, 1] },
  { q: 'Mana yang lebih menggambarkan Anda?', options: ['Saya bekerja paling baik bersama tim', 'Saya mengejar target yang tinggi'], scales: [2, 3] },
  { q: 'Mana yang lebih menggambarkan Anda?', options: ['Saya tetap tenang saat tekanan tinggi', 'Saya suka memimpin rapat'], scales: [4, 0] },
  { q: 'Mana yang lebih menggambarkan Anda?', options: ['Saya mengikuti prosedur dengan rapi', 'Saya senang membantu rekan'], scales: [1, 2] },
  { q: 'Mana yang lebih menggambarkan Anda?', options: ['Saya ingin menjadi yang terbaik', 'Saya bisa bekerja shift panjang'], scales: [3, 4] },
  { q: 'Mana yang lebih menggambarkan Anda?', options: ['Saya mengambil keputusan dengan cepat', 'Saya mencatat semua hasil kerja'], scales: [0, 1] },
  { q: 'Mana yang lebih menggambarkan Anda?', options: ['Saya mencari pendapat tim dulu', 'Saya menetapkan target sendiri'], scales: [2, 3] },
  { q: 'Mana yang lebih menggambarkan Anda?', options: ['Saya tidak mudah menyerah', 'Saya senang bertanggung jawab atas orang lain'], scales: [4, 0] },
  { q: 'Mana yang lebih menggambarkan Anda?', options: ['Saya teliti terhadap angka', 'Saya mudah bergaul dengan orang baru'], scales: [1, 2] },
  { q: 'Mana yang lebih menggambarkan Anda?', options: ['Saya suka tantangan baru', 'Saya tetap fokus di pekerjaan berulang'], scales: [3, 4] },
]

export type InstrumentKind = 'choice' | 'inventory' | 'drawing'

export interface Instrument {
  kind: InstrumentKind
  intro: string
  items: readonly Choice[]
  /** What to draw, for projective drawing tests. */
  prompt?: string
}

export const INSTRUMENTS: Record<string, Instrument> = {
  Aritmatika: { kind: 'choice', intro: 'Sepuluh soal hitungan. Pilih satu jawaban untuk tiap soal.', items: ARITHMETIC },
  'PAPI Kostick': { kind: 'inventory', intro: 'Untuk tiap pasangan, pilih pernyataan yang paling menggambarkan Anda. Tidak ada jawaban benar atau salah.', items: WORK_STYLE },
  Baum: { kind: 'drawing', intro: 'Tes gambar. Hasilnya dinilai psikolog.', items: [], prompt: 'Gambarlah sebuah pohon berbuah, selain pohon kelapa.' },
  DAP: { kind: 'drawing', intro: 'Tes gambar. Hasilnya dinilai psikolog.', items: [], prompt: 'Gambarlah satu orang secara utuh, dari kepala sampai kaki.' },
  Wartegg: { kind: 'drawing', intro: 'Tes gambar. Hasilnya dinilai psikolog.', items: [], prompt: 'Lanjutkan tanda di kotak menjadi gambar yang bermakna bagi Anda.' },
}

/** Share of a choice test answered right, 0 to 100. */
export function scoreChoices(items: readonly Choice[], answers: readonly (number | undefined)[]) {
  const right = items.filter((item, i) => item.answer !== undefined && answers[i] === item.answer).length
  return Math.round((right / Math.max(1, items.length)) * 100)
}

/** How often each work-style scale was chosen, as a share of the times it was offered. */
export function workStyleProfile(answers: readonly (number | undefined)[]) {
  const offered = WORK_SCALES.map(() => 0)
  const chosen = WORK_SCALES.map(() => 0)
  WORK_STYLE.forEach((item, i) => {
    item.scales.forEach((s) => (offered[s]! += 1))
    const pick = answers[i]
    if (pick !== undefined) chosen[item.scales[pick]!]! += 1
  })
  return WORK_SCALES.map((scale, i) => ({ scale, share: Math.round((chosen[i]! / Math.max(1, offered[i]!)) * 100) }))
}

export interface Course {
  lessons: ReadonlyArray<{ title: string; body: string }>
  quiz: readonly Choice[]
}

/** Lessons and quiz per course title. A course without its own entry uses the general workplace module. */
export const COURSES: Record<string, Course> = {
  'Induksi K3 karyawan baru': {
    lessons: [
      { title: 'Hak dan kewajiban K3', body: 'Setiap pekerja berhak menolak pekerjaan yang tidak aman dan wajib memakai APD sesuai area. Laporkan setiap kondisi tidak aman ke atasan atau petugas K3 sebelum bekerja.' },
      { title: 'Rambu dan zona pabrik', body: 'Zona merah hanya untuk pemegang izin kerja. Ikuti jalur pejalan kaki berwarna hijau, jangan memotong jalur forklift, dan kenali titik kumpul terdekat dari area kerja Anda.' },
      { title: 'Melapor insiden', body: 'Kecelakaan, hampir celaka, dan tumpahan dilaporkan pada shift yang sama lewat aplikasi atau ke supervisor. Laporan cepat membantu mencegah kejadian berulang.' },
    ],
    quiz: [
      { q: 'Apa yang Anda lakukan bila melihat kondisi tidak aman?', options: ['Melanjutkan pekerjaan', 'Melaporkan ke atasan atau petugas K3', 'Menunggu shift berikutnya'], answer: 1 },
      { q: 'Siapa yang boleh masuk zona merah?', options: ['Semua karyawan', 'Pemegang izin kerja', 'Tamu dengan pendamping'], answer: 1 },
      { q: 'Kapan kejadian hampir celaka dilaporkan?', options: ['Pada shift yang sama', 'Akhir bulan', 'Tidak perlu dilaporkan'], answer: 0 },
    ],
  },
  'Penanganan bahan kimia dan GHS': {
    lessons: [
      { title: 'Membaca label GHS', body: 'Label GHS memuat kata sinyal (Bahaya atau Peringatan), piktogram, pernyataan bahaya, dan tindakan pencegahan. Kata Bahaya menandakan risiko lebih tinggi dari Peringatan.' },
      { title: 'Lembar data keselamatan', body: 'SDS menjelaskan bahaya, APD, penanganan tumpahan, dan pertolongan pertama. Baca SDS sebelum pertama kali menangani bahan, dan simpan salinannya dekat area kerja.' },
      { title: 'Penyimpanan dan tumpahan', body: 'Pisahkan asam dari basa dan bahan pengoksidasi dari bahan mudah terbakar. Untuk tumpahan, amankan area, pakai APD, lalu gunakan kit tumpahan sesuai SDS.' },
    ],
    quiz: [
      { q: 'Kata sinyal mana yang menandakan risiko lebih tinggi?', options: ['Peringatan', 'Bahaya', 'Perhatian'], answer: 1 },
      { q: 'Di mana Anda menemukan cara penanganan tumpahan?', options: ['Lembar data keselamatan (SDS)', 'Faktur pembelian', 'Jadwal shift'], answer: 0 },
      { q: 'Asam sulfat disimpan …', options: ['Bersama soda kaustik', 'Terpisah dari basa', 'Di ruang kantor'], answer: 1 },
    ],
  },
  'Tanggap darurat dan evakuasi': {
    lessons: [
      { title: 'Alarm dan titik kumpul', body: 'Alarm panjang berarti evakuasi. Hentikan pekerjaan dengan aman, tinggalkan barang, dan menuju titik kumpul lewat jalur evakuasi tanpa berlari.' },
      { title: 'Pemadam api ringan', body: 'Gunakan metode TATS: tarik pin, arahkan ke pangkal api, tekan tuas, sapukan. Padamkan hanya api kecil dan pastikan ada jalan keluar di belakang Anda.' },
    ],
    quiz: [
      { q: 'Alarm panjang berbunyi. Anda …', options: ['Menyelesaikan pekerjaan dulu', 'Menuju titik kumpul lewat jalur evakuasi', 'Mengambil barang pribadi'], answer: 1 },
      { q: 'Ke mana nozzle APAR diarahkan?', options: ['Ke pangkal api', 'Ke asap', 'Ke atas api'], answer: 0 },
    ],
  },
  'Dasar proses granulasi NPK': {
    lessons: [
      { title: 'Alur proses', body: 'Bahan baku ditimbang, dicampur, digranulasi dengan uap dan cairan, dikeringkan, didinginkan, lalu diayak. Granul di luar ukuran 2 sampai 4 mm dikembalikan sebagai recycle.' },
      { title: 'Kadar air dan kekerasan', body: 'Kadar air di atas 2,5% membuat pupuk menggumpal di gudang. Suhu pengering dan laju umpan menentukan kadar air dan kekerasan granul.' },
    ],
    quiz: [
      { q: 'Ukuran granul standar adalah …', options: ['1 sampai 2 mm', '2 sampai 4 mm', '5 sampai 8 mm'], answer: 1 },
      { q: 'Kadar air terlalu tinggi menyebabkan …', options: ['Pupuk menggumpal', 'Kadar N naik', 'Granul lebih keras'], answer: 0 },
    ],
  },
}

const GENERAL: Course = {
  lessons: [
    { title: 'Tujuan modul', body: 'Modul ini menjelaskan aturan dan cara kerja yang berlaku di perusahaan untuk topik ini. Baca setiap bagian lalu kerjakan kuis di akhir.' },
    { title: 'Penerapan di tempat kerja', body: 'Terapkan aturan ini setiap hari. Bila ragu, tanyakan ke atasan langsung atau pemilik proses sebelum bertindak.' },
  ],
  quiz: [
    { q: 'Bila ragu menerapkan aturan, Anda …', options: ['Menebak sendiri', 'Bertanya ke atasan atau pemilik proses', 'Mengabaikannya'], answer: 1 },
    { q: 'Kapan aturan ini diterapkan?', options: ['Setiap hari', 'Hanya saat audit', 'Hanya saat diminta'], answer: 0 },
  ],
}

export const courseContent = (title: string) => COURSES[title] ?? GENERAL

/** The link token of a psychometric test: its id reversed and encoded, so a link cannot be guessed from a neighbour's. */
export const testToken = (id: string) => btoa([...id].reverse().join('')).replace(/=+$/, '')
/** The test id a link token stands for, or nothing when the token is malformed. */
export function testIdOf(token: string) {
  try {
    return [...atob(token)].reverse().join('')
  } catch {
    return undefined
  }
}
