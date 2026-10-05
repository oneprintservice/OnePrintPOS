# OnePrint POS fix11.6 — Unit Identity & Service History

Basis: fix11.5.

## Perubahan utama
- Menjadikan `/unit/{unitId}` sebagai identitas kanonik unit fisik servis.
- QR/barcode unit tetap berupa kode identitas, bukan URL tracking.
- Setiap servis baru/diubah menyimpan `unitId` dan mempertahankan `printerId` untuk kompatibilitas data lama.
- Scan ID unit memuat pelanggan, merk/tipe, serial, dan riwayat servis unit.
- Riwayat membaca servis lama yang memiliki `printerId` atau `serial`, sehingga data existing tidak hilang.
- Data lama di `/printers` tetap dibaca sebagai fallback dan disinkronkan saat unit disimpan kembali.
- Daftar servis dapat dicari menggunakan ID unit.
- Tidak mengubah logika inventori, restock, transaksi, scanner, atau printer profile.

## Skema baru
`/unit/{safeKey(unitId)}`
- unitId
- barcode
- serial
- merk
- pelanggan
- telp
- kelengkapan
- catatan
- createdAt
- updatedAt

`/servis/{nomor}`
- unitId
- printerId (compatibility)
- ...data servis lainnya

## Prinsip QR
QR label fisik tetap berisi `unitId` (contoh `OPS-PRN-000127`), bukan URL.
