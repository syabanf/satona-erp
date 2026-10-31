# Skenario demo Satona ERP

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
| Bonus | Mode OS | **OS view** di menu kiri (sebelah Dashboard view), atau `/os`: buka Armada dan Persetujuan sebagai jendela, geser, kecilkan ke dock. Perubahan di satu jendela muncul di jendela lain. |
| Bonus | Geofence dan denah | Transportasi → Data acuan → **Geofences** → satu geofence: klik peta untuk memindahkan pusat, geser radius, simpan. Tampilan **Denah** di daftar mana pun, dan denah lokasi di halaman pabrik (mis. `PLT-0009`). |

## Pintasan yang membantu

- `⌘K` atau `/`: cari data, menu atau kode transaksi dari halaman mana pun.
- `N` di halaman daftar: buat data baru.
- Nyalakan **Tampilkan kode transaksi** bila penonton terbiasa dengan SAP (contoh: `TRP01` membuat perjalanan).

## Batasan yang perlu disampaikan

- Ini demo frontend dengan data contoh. Telemetri truk dan nilai tag SCADA disimulasikan.
- Integrasi Kafka, Debezium, ClickHouse, Keycloak dan Kong tampil sebagai konfigurasi; layanannya dibangun bersama backend.
- Tanggal demo berpusat di akhir Oktober 2026.
