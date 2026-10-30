const MODULE_NAMES: Record<string, string> = {
  mdm: 'Data utama', epm: 'Perencanaan keuangan', vms: 'Pengadaan dan pemasok', grc: 'Risiko dan kepatuhan',
  bi: 'Analitik grup', occ: 'Pusat operasi', hrs: 'SDM', fin: 'Keuangan', inv: 'Persediaan',
  gas: 'Layanan dan dokumen', she: 'Keselamatan kerja', sys: 'Administrasi sistem',
  tms: 'Transportasi', wms: 'Gudang', haz: 'Angkutan bahan berbahaya', fbl: 'Tagihan pengiriman',
  bpf: 'Produksi batch', mrp: 'Perencanaan produksi', qc: 'Pengendalian mutu', eam: 'Perawatan aset',
  mes: 'Operasi produksi', dms: 'Distribusi', cfp: 'Produksi berkelanjutan', ehs: 'Keselamatan bahan kimia',
  tfm: 'Tangki penyimpanan', gtr: 'Pelacakan dan penarikan produk',
}

const RECORD_NAMES: Record<string, string> = {
  'vms.requisitions': 'permintaan pembelian', 'vms.orders': 'pesanan pembelian',
  'tms.checkins': 'pemeriksaan kendaraan', 'tms.trips': 'perjalanan',
  'occ.alarms': 'alarm', 'hrs.leaves': 'pengajuan cuti', 'she.permits': 'izin kerja',
  'eam.workorders': 'pekerjaan perawatan', 'mes.workorders': 'pekerjaan produksi',
  'dms.orders': 'pesanan pelanggan',
}

export const moduleLabel = (id: string, fallback?: string) => MODULE_NAMES[id] ?? fallback ?? id.toUpperCase()
export const recordLabel = (key: string, fallback: string) => RECORD_NAMES[key] ?? fallback

const FIELD_NAMES: Record<string, string> = {
  'Target value': 'Nilai kontrak', Vendor: 'Pemasok', 'Group revenue': 'Pendapatan grup',
  'Net income': 'Laba bersih', Entity: 'Perusahaan', 'Estimated value': 'Perkiraan nilai',
  Quantity: 'Jumlah', 'Purchase order': 'Pesanan pembelian', Received: 'Diterima',
  Score: 'Nilai', Result: 'Hasil',
}

export const fieldLabel = (label: string) => FIELD_NAMES[label] ?? label
