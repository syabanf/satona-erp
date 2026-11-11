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
| 2-4 | Menu | **Semua menu**: pilih perusahaan (Rotama), buka modul Transportasi, fitur tersusun tanpa folder bertingkat. Ketik "cuti" di kolom cari menu. |
| 4-8 | Perjalanan | Panel samping modul: Pekerjaan harian, Data acuan, Pengaturan. Tunjukkan tampilan **Tabel, Papan, Kalender, Gantt, Peta, 3D (Single line, Shopfloor), Grafik**. Buat perjalanan baru lewat tombol **New trip** (jendela modal). Pakai **Filters** untuk menyaring sopir dan jarak. |
| 8-10 | Armada | Halaman modul Transportasi → **Open live fleet map** (atau `/fleet`): strip telemetri langsung, lapisan peta Truk, Rute dan SCADA. Klik truk B 9037 TRA (kecepatan dan suhu bermasalah), lalu titik SCADA Merak yang terganggu. |
| 10-12 | Persetujuan | **Tugas saya → Periksa persetujuan**: label "Level n dari m", rantai persetujuan bertingkat dari matriks persetujuan. Buka izin kerja PTW-0012 untuk melihat rantainya. |
| 12-14 | Kokpit | Keselamatan kerja (SHE), SDM, Keuangan: semua grafik bisa diklik untuk masuk ke data. |
| 14-16 | Holding | Halaman **Scope coverage** (`/coverage`): 57 butir gap analysis dan layar yang menjawab tiap butir. **Group analytics** (`/analytics`): perputaran persediaan dan peta risiko. |
| 16-18 | Peran lain | Ganti peran dari kartu akun di kiri bawah: **Driver (Driver App)** hanya melihat Transportasi, **Vendor / Supplier (B2B Portal)** mengisi penawaran. |
| 18-20 | Bantuan | **Tutorial penggunaan**: tur singkat dan panduan langkah demi langkah. |
| Bonus | Mode OS | **OS view** di menu kiri (sebelah Dashboard view), atau `/os`: buka Armada dan Persetujuan sebagai jendela, geser, kecilkan ke dock. Di HP tampil sebagai layar utama dengan ikon aplikasi. Perubahan di satu jendela muncul di jendela lain. |
| Bonus | SCADA pabrik | `/mes/scada` (atau Laporan di modul MES/EAM): mimik proses Line A dan B Gresik dengan tag langsung, alarm yang bisa diakui, tab **3D**. Klik Dryer A-3 yang alarm, lalu **Permintaan perawatan** untuk membuat MR dengan isian terisi. Menu samping modul besar (EAM, MES, MDM, SHE, dll.) kini dikelompokkan per sub-modul. |
| Bonus | MES dan CMMS | **Reliability cockpit** (`/eam/reliability`): Predictive watch (Granulator B-1 menuju batas getaran 7,1 mm/s), PM berdasarkan jam jalan, nilai buku dan utilisasi aset. Buka reservasi part (`PI-`), klik **Issue from store**, stok part berkurang. **Scheduling board** (`/mrp/planning`): blok setup sebelum tiap job, merah bila lebih pendek dari matriks changeover. |
| Bonus | Penawaran | Tagihan pengiriman → **Customer quotations** → **New quotation** (atau `/quotations/new`): pilih cabang, **Tarik dari inquiry** untuk mengisi pelanggan, PIC dan baris pertama, **Tambah produk** dari layanan standar atau tarif lane, isi diskon dan PPN 11%, lalu simpan. Inquiry yang ditarik pindah ke status Quoted. |
| Bonus | Geofence dan denah | Transportasi → Data acuan → **Geofences** → satu geofence: klik peta untuk memindahkan pusat, geser radius, simpan. Tampilan **Denah** di daftar mana pun, dan denah lokasi di halaman pabrik (mis. `PLT-0009`). |

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
