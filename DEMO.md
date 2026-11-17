# Skenario demo WIT Manufacturing Platform

Panduan presenter untuk demo 15 sampai 20 menit. Semua data adalah data contoh yang tersimpan di browser; perubahan selama demo hanya ada di perangkat itu.

## Sebelum mulai

1. Jalankan aplikasi: `pnpm install`, lalu `pnpm dev` (port 5191), atau buka situs demo.
2. Di halaman masuk, pilih **Group IT Program Lead**. Peran ini melihat semua modul dan bisa menyetujui.
3. Klik **Atur ulang data demo** di bagian bawah menu kiri, supaya angka kembali ke awal.
4. Untuk penonton yang lebih senior, nyalakan **Teks besar** di bagian bawah menu kiri.

## Alur demo

| Menit | Bagian | Yang ditunjukkan |
|---|---|---|
| 0-2 | Beranda | Lampu status keseluruhan, daftar **Perlu tindakan sekarang**, ubin area kerja dengan lampu hijau, kuning dan merah. |
| 2-4 | Menu | **Semua menu**: satu daftar per fungsi (Produksi, Perawatan dan perangkat, Rantai pasok, Keuangan, SDM dan K3, Tata kelola). Buka Rantai pasok → Transportasi; fitur tersusun per sub-modul. Ketik "cuti" di kolom cari menu. |
| 4-8 | Perjalanan | Panel samping modul: Pekerjaan harian, Data acuan, Pengaturan. Tunjukkan tampilan **Tabel, Papan, Kalender, Gantt, Peta, 3D (Single line, Shopfloor), Grafik**. Buat perjalanan baru lewat tombol **New trip** (jendela modal). Pakai **Filters** untuk menyaring sopir dan jarak. |
| 8-10 | Armada | Halaman modul Transportasi → **Open live fleet map** (atau `/fleet`): strip telemetri langsung, lapisan peta Truk, Rute dan SCADA. Klik truk B 9037 TRA (kecepatan dan suhu bermasalah), lalu titik SCADA Merak yang terganggu. |
| 10-12 | Persetujuan | **Tugas saya → Periksa persetujuan**: label "Level n dari m", rantai persetujuan bertingkat dari matriks persetujuan. Buka izin kerja PTW-0012 untuk melihat rantainya. |
| 12-14 | Kokpit | Keselamatan kerja (SHE), SDM, Keuangan: semua grafik bisa diklik untuk masuk ke data. |
| 14-16 | Holding | Halaman **Scope coverage** (`/coverage`): 57 butir gap analysis dan layar yang menjawab tiap butir. **Group analytics** (`/analytics`): perputaran persediaan dan peta risiko. |
| 16-18 | Peran lain | Ganti peran dari kartu akun di kiri bawah: **Driver (Driver App)** hanya melihat Transportasi, **Vendor / Supplier (B2B Portal)** mengisi penawaran. |
| 18-20 | Bantuan | **Tutorial penggunaan**: tur singkat dan panduan langkah demi langkah. |
| Bonus | Mode OS | **OS view** di menu kiri (sebelah Dashboard view), atau `/os`: buka Armada dan Persetujuan sebagai jendela, geser, kecilkan ke dock. Di HP tampil sebagai layar utama dengan ikon aplikasi. Perubahan di satu jendela muncul di jendela lain. |
| Pembuka | Situs profil | Halaman awal di `/` untuk semua pengunjung (dashboard pindah ke `/dashboard`): video pabrik sebagai latar dan animasi saat menggulir. Halaman **Platform** (arsitektur dan kemampuan), **Solusi** (enam kelompok, tiap modul dengan ikon, penjelasan, fitur dan tim), **Tentang** (visi, misi, nilai, cara penerapan) dan **Kontak** (formulir demo). Klik **Coba demo** untuk ke halaman masuk. |
| Bonus | Keuangan | `/finance/coa`: bagan akun bertingkat dengan saldo. **Entri jurnal baru**: isi debit dan kredit, tombol simpan aktif hanya saat seimbang, lalu setujui dan posting. `/finance/reports`: neraca saldo, buku besar, neraca, laba rugi, arus kas, umur piutang, aset tetap, anggaran vs aktual, dengan CSV dan cetak. Buat faktur pelanggan lalu tandai dibayar: jurnalnya terbentuk otomatis. **Jalankan penyusutan** di bagian bawah laporan. |
| Bonus | Area karyawan | Tombol **Backoffice / Area karyawan** di atas menu. Absensi: clock in dengan lokasi dan selfie, kalender bulanan. Izin & cuti, lembur, pinjaman, kasbon langsung diajukan. Slip gaji dari penggajian (BPJS, PPh 21 TER). Shift tim: jadwal mingguan dan tukar shift. Atasan memutuskan di **Persetujuan tim**. Peran Employee (ESS) hanya melihat area ini. |
| Bonus | Alur antarmodul | Tagihan pemasok hanya lolos **Cocokkan PO dan GRN** bila barang sudah diterima; dibayar lewat **Bayar tagihan** lalu disetujui. Kirim pesanan penjualan mengurangi stok barang jadi dan memposting HPP; faktur dari pesanan terkirim memposting PPN keluaran dan faktur pajak. Order produksi berjalan memakai BOM ke barang dalam proses, selesai masuk barang jadi. Bacaan meter membuat work order PM; work order selesai membebankan biaya ke aset. |
| Bonus | Treasury | `/finance/bank`: cocokkan rekening koran dengan jurnal, bukukan biaya bank dan jasa giro. Laporan **Buku pembantu**: piutang dan utang cocok dengan faktur terbuka. **Revaluasi kurs** dan **Ekspor e-Faktur** di bagian proses akhir periode. |
| Bonus | HRIS lengkap | Menu SDM kini per sub-modul: **Rekrutmen** (permintaan tenaga kerja, lowongan, psikotes, penawaran), **Kepegawaian** (perubahan data, resign, offboarding dengan clearance), **Penggajian** (struktur gaji, usulan kenaikan, klaim biaya, run THR), **Kinerja** (penilaian 60/30/10, 360, logbook, suksesi sembilan kotak), **Pembelajaran** (kursus dan sertifikat). `/hris/severance`: kalkulator pesangon PP 35/2021. Area karyawan: koreksi absensi, klaim biaya, logbook, kursus, perubahan data, resign. |
| Bonus | Akuntansi lanjutan | Kas masuk, keluar dan transfer diposting dari dokumennya. Nota kredit mengurangi piutang dan PPN. **Balik jurnal** pada jurnal terposting. Laporan baru: **SPT Masa PPN**, **PPh 23**, **Perubahan ekuitas**, **Saldo per mitra**. **Jurnal berulang** diposting dari proses akhir periode. |
| Bonus | Grup dan kinerja | `/finance/payment-run`: pilih tagihan, buat run, setujui, jalankan, unduh file transfer. Laporan **Konsolidasi** (eliminasi antarunit) dan **Pusat biaya**. Aset tetap: metode saldo menurun dan **Lepas aset** dengan laba atau rugi. Proses akhir periode: file transfer gaji dan bukti potong XML. `/hris/performance`: kalibrasi predikat per departemen dan **Buka siklus 360**; penilai mengisi di Area karyawan → Penilaian 360. |
| Bonus | Khusus pabrik | **Shift tim**: empat regu bergilir pagi, siang, malam, libur tanpa henti; staf kantor Senin sampai Jumat. Slip gaji memuat tunjangan shift, uang makan, tunjangan bahaya, dan lembur hari libur dengan tarif 2, 3, 4 kali. Work order dan izin kerja menolak petugas dengan lisensi K3 kedaluwarsa. **Order produksi**: mulai batch memakai bahan dengan harga rata-rata bergerak; selesaikan dengan hasil aktual untuk melihat biaya tenaga kerja, overhead, energi, selisih rendemen dan selisih pemakaian. Stok opname dan penyesuaian stok memposting selisihnya. Pesanan pupuk bersubsidi membukukan piutang subsidi; klaim subsidi melunasinya. |
| Bonus | Lantai pabrik | `/mrp/run`: kebutuhan bahan dari order terencana, satu tombol membuat PR untuk yang kurang. Penerimaan barang membuka lot bahan; mulai batch memakai lot; selesai batch membuka lot barang jadi berstatus tahan sampai sampel lab lulus, dan baru boleh dikirim setelah COA terbit. `/traceability/ledger`: ketik nomor lot atau dokumen untuk asal dan tujuannya. Tiket timbang dari penerimaan atau pesanan: berat bersih menjadi jumlah penerimaan dan pengiriman ditolak bila beratnya beda. Pembacaan utilitas per lini menjadi biaya energi batch. Shutdown: work order melapor ke paketnya dengan anggaran dan progres. PR dengan pusat biaya ditolak bila melebihi anggaran. Laporan **Selisih produksi** dan **Proyeksi kas**. |
| Bonus | Perencanaan dan niaga | `/mrp/run` bagian bawah: beban tiap lini per minggu terhadap kapasitasnya; order ditolak dirilis ke minggu yang penuh. Kontrak payung: **Buat PO dari kontrak** mengisi pemasok, bahan dan harga, dan menolak di luar kuota atau masa berlaku. Retur ke pemasok membalik stok, lot dan akrual; retur pelanggan masuk stok lagi dan membuat nota kredit. Pesanan konsinyasi pindah ke barang konsinyasi sampai distributor melaporkan terjual. Overhead batch diambil dari beban pusat biaya produksi. **Revaluasi barang jadi ke standar** di proses akhir periode. |
| Bonus | Dokumen | Buka WO-0001: **Cetak / PDF** (kop surat, isian, baris, kotak tanda tangan), tab **Komentar** (ketik @ untuk menyebut peran) dan **Lampiran** (unggah foto atau PDF). Di PR yang disetujui, kartu **Langkah berikutnya** membuat PO terisi otomatis. |
| Bonus | Otomatisasi | `/automation`: PM jatuh tempo menjadi work order, stok minimum menjadi permintaan pembelian, pengingat persetujuan. Klik **Jalankan sekarang** atau nyalakan **Otomatis**. |
| Bonus | Input lapangan | Daftar mana pun: **Impor** (CSV atau tempel dari Excel, dengan cek per baris), **Label QR** (cetak label), dan tombol pindai di kanan atas untuk membuka data dari QR atau kode seperti `AST-0007`. Versi produksi bisa dipasang di ponsel dan tetap jalan tanpa sinyal. |
| Bonus | Personal | **Tile saya** di `/dashboard` (Atur tile), **Simpan tampilan** di atas tabel, dan **Profil saya** dari kartu akun (foto, kontak, notifikasi per kanal). Label field, status dan tombol alur kini berbahasa Indonesia. |
| Bonus | Monitoring sistem | Pil status di kanan atas setiap halaman, atau `/monitoring`: kesehatan 8 layanan (API, broker, CDC, SSO, sumber OT, perangkat IoT) dengan alasannya, latensi API langsung, sumber daya server dan aktivitas data. Ubah satu data lalu lihat aktivitasnya muncul. |
| Bonus | Manajemen perangkat | `/devices` (modul Manajemen perangkat, Holding): 64 perangkat IoT/OT dengan heartbeat langsung, filter jenis dan status. Klik **Ping** di perangkat online (berhasil) dan offline (gagal); keduanya tercatat di Remote commands. Kepatuhan firmware per model, rollout OTA dan alert perangkat. |
| Bonus | SCADA pabrik | `/mes/scada` (atau Laporan di modul MES/EAM): mimik proses Line A dan B Gresik dengan tag langsung, alarm yang bisa diakui, tab **3D**. Klik Dryer A-3 yang alarm, lalu **Permintaan perawatan** untuk membuat MR dengan isian terisi. Menu samping modul besar (EAM, MES, MDM, SHE, dll.) kini dikelompokkan per sub-modul. |
| Bonus | MES dan CMMS | **Reliability cockpit** (`/eam/reliability`): Predictive watch (Granulator B-1 menuju batas getaran 7,1 mm/s), PM berdasarkan jam jalan, nilai buku dan utilisasi aset. Buka reservasi part (`PI-`), klik **Issue from store**, stok part berkurang. **Scheduling board** (`/mrp/planning`): blok setup sebelum tiap job, merah bila lebih pendek dari matriks changeover. |
| Bonus | Penawaran | Tagihan pengiriman → **Customer quotations** → **New quotation** (atau `/quotations/new`): pilih cabang, **Tarik dari inquiry** untuk mengisi pelanggan, PIC dan baris pertama, **Tambah produk** dari layanan standar atau tarif lane, isi diskon dan PPN 11%, lalu simpan. Inquiry yang ditarik pindah ke status Quoted. |
| Bonus | Geofence dan denah | Transportasi → Rute dan lokasi → **Geofences** → satu geofence: klik peta untuk memindahkan pusat, geser radius, simpan. Tampilan **Denah** di daftar mana pun, dan denah lokasi di halaman pabrik (mis. `PLT-0009`). |

## Pintasan yang membantu

- `⌘K` atau `/`: cari data, menu atau kode transaksi dari halaman mana pun.
- `N` di halaman daftar: buat data baru.
- Nyalakan **Tampilkan kode transaksi** bila penonton terbiasa dengan SAP (contoh: `TRP01` membuat perjalanan).

## Batasan yang perlu disampaikan

- Ini demo frontend dengan data contoh. Telemetri truk dan nilai tag SCADA disimulasikan.
- Integrasi Kafka, Debezium, ClickHouse, Keycloak dan Kong tampil sebagai konfigurasi; layanannya dibangun bersama backend.
- Tanggal demo berpusat di akhir Oktober 2026.

## Menjalankan dengan Docker

`docker compose up -d --build` membangun aplikasi dan menyajikannya lewat nginx di http://localhost:8080. Port lain: `PORT=8091 docker compose up -d --build`. Tanpa compose: `docker build -t wit-manufacturing-platform .` lalu `docker run -p 8080:80 wit-manufacturing-platform`.
