/** Copy for the public site: the six solution groups, every module, the platform capabilities and the profile pages. */
import { Boxes, Building2, Cable, CalendarRange, Cpu, Eye, Factory, GitBranch, Handshake, KeyRound, Landmark, Layers, LineChart, MonitorSmartphone, Radio, Rocket, ShieldCheck, Sparkles, Target, Users, Wrench, type LucideIcon } from 'lucide-react'

export interface GroupCopy {
  icon: LucideIcon
  tagline: string
  body: string
  outcomes: readonly string[]
}

/** Keyed by the menu's function-group id. */
export const GROUP_COPY: Record<string, GroupCopy> = {
  production: {
    icon: Factory,
    tagline: 'Dari bahan baku sampai produk jadi, setiap batch tercatat.',
    body: 'Rencanakan produksi, jalankan perintah kerja di lantai pabrik, ukur OEE per lini, uji mutu di laboratorium dan lacak setiap lot sampai ke pelanggan.',
    outcomes: ['OEE per lini dan shift terlihat langsung', 'Setiap lot bisa ditelusuri maju dan mundur', 'Jadwal mesin memperhitungkan waktu changeover'],
  },
  maintenance: {
    icon: Wrench,
    tagline: 'Mesin dirawat sebelum rusak, perangkat diawasi tanpa henti.',
    body: 'Kelola aset dan suku cadang, jadwalkan perawatan berdasarkan kalender atau jam jalan, prediksi kerusakan dari tren getaran, dan pantau PLC, sensor dan gateway dari satu konsol.',
    outcomes: ['Perawatan preventif berbasis jam jalan', 'Peringatan dini dari tren kondisi mesin', 'Ping, reboot dan update firmware jarak jauh'],
  },
  supply: {
    icon: Boxes,
    tagline: 'Pengadaan, gudang, armada dan distribusi dalam satu alur dokumen.',
    body: 'Dari permintaan pembelian sampai penerimaan barang, dari stok gudang sampai truk di jalan, dari kuota distributor sampai tagihan pengiriman, semua dokumen saling terhubung.',
    outcomes: ['Perjalanan armada terpantau di peta langsung', 'Stok dan reorder point di semua gudang', 'Penawaran pelanggan dalam format dokumen resmi'],
  },
  finance: {
    icon: Landmark,
    tagline: 'Angka keuangan grup yang tutup buku lebih cepat.',
    body: 'Jurnal, utang piutang, faktur pajak, rekonsiliasi bank, konsolidasi antarunit dan dashboard eksekutif dalam satu basis data.',
    outcomes: ['Konsolidasi dan eliminasi antarunit otomatis', 'Faktur pajak dan rekonsiliasi bank terhubung', 'KPI grup untuk direksi dalam satu layar'],
  },
  people: {
    icon: Users,
    tagline: 'Orang yang tepat, aman di tempat kerja.',
    body: 'Absensi, cuti, lembur dan gaji untuk seluruh karyawan, ditambah izin kerja, inspeksi, insiden, APD dan keselamatan bahan kimia.',
    outcomes: ['Izin kerja dan JSA sebelum pekerjaan berisiko', 'Insiden, CAPA dan audit K3 tercatat rapi', 'Pengajuan cuti dan lembur langsung dari ponsel'],
  },
  governance: {
    icon: ShieldCheck,
    tagline: 'Satu sumber kebenaran, satu aturan akses.',
    body: 'Data utama grup, risiko dan kepatuhan, peran dan izin, matriks persetujuan bertingkat dan integrasi ke sistem luar dikelola di satu tempat.',
    outcomes: ['Data pelanggan, pemasok dan material tanpa duplikat', 'Persetujuan bertingkat dengan delegasi', 'Hak akses per peran dan per modul'],
  },
}

export interface ModuleCopy {
  body: string
  features: readonly [string, string, string]
}

/** One paragraph and three key features per module, in the language of the app. */
export const MODULE_COPY: Record<string, ModuleCopy> = {
  mes: { body: 'Eksekusi produksi di lantai pabrik: perintah kerja per operasi, catatan OEE per shift, downtime dengan kode alasan, dan penahanan mutu.', features: ['Perintah kerja per operasi dari batch', 'OEE: availability × performance × quality', 'Downtime, quality hold dan NCR'] },
  mrp: { body: 'Perencanaan kebutuhan material dan kapasitas mesin, dengan papan jadwal yang memperhitungkan waktu setup antar grade.', features: ['Kebutuhan material dan planned order', 'Papan jadwal per work centre', 'Matriks changeover antar grade'] },
  bpf: { body: 'Formula produk, bill of materials dan perintah produksi batch, termasuk penyesuaian kadar air bahan baku.', features: ['Formula dan versi resep', 'Bill of materials per grade', 'Perintah produksi batch'] },
  qc: { body: 'Rencana inspeksi, sampel laboratorium dan sertifikat analisis yang terhubung ke instrumen LIMS.', features: ['Batas spesifikasi per parameter', 'Sampel lab per batch', 'Certificate of Analysis untuk pelanggan'] },
  cfp: { body: 'Proses kontinu untuk pabrik kimia: log reaktor, kampanye produksi, limbah dan alokasi biaya co-product.', features: ['Log suhu dan tekanan reaktor', 'Kampanye produksi', 'Alokasi biaya co-product'] },
  gtr: { body: 'Silsilah produk dari bahan baku sampai pelanggan, spesifikasi produk dan penarikan produk bila ada masalah.', features: ['Pelacakan lot maju dan mundur', 'Spesifikasi produk', 'Penarikan produk terkendali'] },
  eam: { body: 'CMMS lengkap: register aset, perintah kerja, rencana PM berbasis kalender dan jam jalan, suku cadang, kalibrasi dan analisis akar masalah.', features: ['PM berbasis jam jalan', 'Prediksi dari tren kondisi mesin', 'Suku cadang per mesin dan pengeluaran ke WO'] },
  dvm: { body: 'Registri perangkat IoT dan OT: PLC, gateway, sensor, HMI, scanner, tablet dan kamera, lengkap dengan firmware dan perintah jarak jauh.', features: ['Heartbeat dan status perangkat', 'Rilis firmware dan rollout OTA', 'Ping, reboot dan sinkron konfigurasi'] },
  occ: { body: 'Pusat komando operasi: status unit, alarm dengan eskalasi, sumber data DCS, PLC, IoT, GPS dan CCTV.', features: ['Status unit di semua lokasi', 'Alarm dengan matriks eskalasi', 'Kesehatan sumber data OT'] },
  vms: { body: 'Pengadaan bersama: permintaan pembelian, RFQ dan tender, pesanan pembelian, penerimaan barang dan penilaian pemasok.', features: ['RFQ, tender dan penawaran vendor', 'Daftar pemasok terpilih (AVL)', 'Portal tagihan pemasok'] },
  inv: { body: 'Pengendalian persediaan: saldo stok, aturan reorder, stock opname, penyesuaian, transfer dan pemusnahan.', features: ['Saldo stok per gudang', 'Reorder point dan safety stock', 'Stock opname dan transfer'] },
  wms: { body: 'Manajemen gudang: lokasi rak, zona penyimpanan, lot stok dan tugas putaway serta picking.', features: ['Zona dan bin penyimpanan', 'Lot stok per lokasi', 'Tugas putaway dan picking'] },
  tms: { body: 'Transportasi dan telematika: perjalanan, armada, sopir, rute, geofence, pemeriksaan P2H dan peringatan ADAS.', features: ['Peta armada langsung', 'Geofence dan rute', 'Telemetri suhu dan tekanan tangki'] },
  fbl: { body: 'Tagihan pengiriman, tarif per lane, inquiry dan penawaran pelanggan dalam format dokumen resmi.', features: ['Tarif per lane dan per km', 'Penawaran dengan baris produk', 'Tagihan pengiriman antarunit'] },
  haz: { body: 'Angkutan bahan berbahaya: daftar UN, sertifikat sopir dan manifest B3 sesuai regulasi.', features: ['Daftar UN dangerous goods', 'Sertifikat sopir B3', 'Manifest dan Festronik'] },
  dms: { body: 'Manajemen distributor: kios, harga, kuota subsidi dan non-subsidi, serta pesanan penjualan.', features: ['Kuota per wilayah dan distributor', 'Daftar harga (HET)', 'Pesanan dari distributor'] },
  tfm: { body: 'Tangki dan penyimpanan curah: level tangki dari sensor IoT, gauge dan rekonsiliasi stok.', features: ['Level tangki langsung', 'Gauge IoT terkalibrasi', 'Rekonsiliasi stok tangki'] },
  fin: { body: 'Keuangan dan akuntansi: jurnal, utang piutang, pembayaran, faktur pajak, rekonsiliasi bank dan kas kecil.', features: ['Utang dan piutang', 'Faktur pajak (e-Faktur)', 'Rekonsiliasi bank'] },
  epm: { body: 'Konsolidasi keuangan dan EPM: periode fiskal, eliminasi antarunit, revaluasi kurs, anggaran dan rolling forecast.', features: ['Konsolidasi bulanan dan tahunan', 'Eliminasi antarunit', 'Anggaran dan forecast'] },
  bi: { body: 'Analitik eksekutif: KPI grup lintas unit, dashboard produksi, persediaan, penjualan dan pembelian.', features: ['KPI grup untuk direksi', 'Drill-down ke data sumber', 'Target KPI per unit'] },
  hrs: { body: 'Human capital: organisasi, posisi, absensi, cuti, lembur, gaji, kontrak, rekrutmen dan pelatihan.', features: ['Absensi dan shift', 'Cuti dan lembur dari ponsel', 'Penggajian dan kontrak'] },
  she: { body: 'Keselamatan dan kesehatan kerja: izin kerja, JSA, HIRADC, insiden, inspeksi, CAPA, APD dan MCU.', features: ['Izin kerja dan JSA', 'Insiden, CAPA dan audit', 'APD dan pemeriksaan kesehatan'] },
  ehs: { body: 'Keselamatan bahan kimia: lembar data keselamatan (SDS/GHS), titik emisi, matriks bahaya dan insiden.', features: ['SDS dan label GHS', 'Pemantauan emisi', 'Matriks bahaya bahan kimia'] },
  gas: { body: 'Layanan internal dan kendali dokumen: tiket layanan dengan kategori dan dokumen terkendali.', features: ['Tiket layanan internal', 'Kategori dan SLA', 'Kendali versi dokumen'] },
  mdm: { body: 'Data utama grup: perusahaan, pabrik, pusat biaya, akun, mitra bisnis, material dan karyawan dalam satu golden record.', features: ['Chart of accounts grup', 'Mitra bisnis tanpa duplikat', 'Katalog material dan kode B3'] },
  grc: { body: 'Tata kelola, risiko dan hukum: register regulasi, izin usaha, temuan audit, register risiko dan laporan kepatuhan.', features: ['Register risiko', 'Izin dan lisensi', 'Temuan audit'] },
  sys: { body: 'Administrasi sistem: peran, izin, matriks persetujuan bertingkat, delegasi, nomor dokumen dan integrasi.', features: ['Peran dan izin per modul', 'Persetujuan bertingkat dan delegasi', 'API gateway, CDC dan SSO'] },
}

export interface Capability {
  icon: LucideIcon
  title: string
  body: string
  points: readonly string[]
}

export const CAPABILITIES: readonly Capability[] = [
  { icon: Layers, title: 'Satu mesin data untuk semua modul', body: 'Setiap modul memakai skema, validasi, alur kerja dan hak akses yang sama, sehingga data dari produksi sampai keuangan saling terhubung.', points: ['200+ jenis data dengan relasi', 'Validasi di setiap simpan', 'Riwayat perubahan per data'] },
  { icon: GitBranch, title: 'Alur kerja dan persetujuan bertingkat', body: 'Status dokumen mengikuti alur yang jelas. Langkah penting menunggu persetujuan bertingkat dari matriks persetujuan, lengkap dengan delegasi.', points: ['Level persetujuan per nilai dokumen', 'Delegasi saat cuti', 'Daftar tugas per peran'] },
  { icon: CalendarRange, title: 'Setiap data dalam tampilan yang pas', body: 'Lihat data yang sama sebagai tabel, papan kanban, kalender, Gantt, peta, denah, grafik atau 3D, tanpa menyiapkan laporan baru.', points: ['Tabel dengan filter di setiap kolom', 'Gantt dan kalender untuk jadwal', 'Peta, denah dan 3D untuk lokasi'] },
  { icon: Radio, title: 'SCADA dan IoT di lantai pabrik', body: 'Mimik proses dengan tag langsung, alarm yang bisa diakui, tampilan 3D lini produksi, dan manajemen perangkat untuk PLC, sensor dan gateway.', points: ['Tag proses per stasiun', 'Alarm dan permintaan perawatan satu klik', 'Firmware dan perintah jarak jauh'] },
  { icon: LineChart, title: 'Monitoring sistem', body: 'Kesehatan API, broker event, integrasi CDC, SSO, sumber data OT dan perangkat IoT dalam satu status, ditambah aktivitas data langsung.', points: ['Status layanan di setiap halaman', 'Latensi dan throughput API', 'Aliran aktivitas data'] },
  { icon: Cable, title: 'Integrasi terbuka', body: 'API gateway untuk mitra, CDC ke gudang data, broker event antar modul, dan SSO melalui penyedia identitas perusahaan.', points: ['REST API dengan kuota', 'CDC ke ClickHouse', 'Kafka dan RabbitMQ'] },
  { icon: KeyRound, title: 'Keamanan dan akses', body: 'Hak akses per peran dan per modul, portal terbatas untuk sopir dan pemasok, serta jejak audit setiap perubahan.', points: ['Akses: lihat, kelola, setujui, portal', 'SSO dengan MFA', 'Jejak audit lengkap'] },
  { icon: MonitorSmartphone, title: 'Desktop, ponsel dan OS view', body: 'Tampilan dashboard untuk kantor, tampilan ponsel untuk lapangan, dan OS view dengan jendela yang bisa disusun untuk ruang kontrol.', points: ['Responsif dari 375 px', 'OS view dengan jendela dan dock', 'Mode teks besar untuk operator'] },
]

export const VALUES: ReadonlyArray<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Target, title: 'Berangkat dari proses', body: 'Kami memetakan proses pabrik lebih dulu, lalu menyusun modul yang mengikutinya.' },
  { icon: Eye, title: 'Data yang terlihat', body: 'Setiap angka di dashboard bisa diklik sampai ke data asalnya.' },
  { icon: Handshake, title: 'Mudah dipakai semua orang', body: 'Dari direksi sampai operator, setiap peran melihat pekerjaan yang relevan untuknya.' },
  { icon: Sparkles, title: 'Terus berkembang', body: 'Modul baru bergabung ke mesin data yang sama tanpa membangun ulang.' },
]

export const STEPS: ReadonlyArray<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Building2, title: 'Pemetaan proses', body: 'Workshop bersama tim pabrik untuk memetakan proses, peran dan dokumen yang berjalan hari ini.' },
  { icon: Layers, title: 'Konfigurasi modul', body: 'Jenis data, alur kerja, matriks persetujuan dan hak akses disusun sesuai hasil pemetaan.' },
  { icon: Cpu, title: 'Integrasi mesin dan sistem', body: 'PLC, sensor, gateway dan sistem yang sudah ada dihubungkan lewat API, CDC dan broker event.' },
  { icon: Rocket, title: 'Go-live bertahap', body: 'Modul dijalankan per area dengan pelatihan per peran dan tutorial di dalam aplikasi.' },
]
