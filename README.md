# OnePrint POS V2

Refactor of the uploaded OnePrint POS codebase.

## What changed
- Admin POS rebuilt into a responsive application shell.
- Firebase access isolated in `js/core/firebase.js`.
- Authentication isolated in `js/core/auth.js`.
- Inventory, customer, service, and receipt logic separated into feature modules.
- Service data and inventory remain compatible with the existing Firebase Realtime Database paths:
  - `pelanggan/*`
  - `inventori/{sparepart,tinta,lisensi,jasa}/*`
  - `servis/*`
- UI is mobile-first and can be packaged later with Capacitor or another mobile wrapper.
- Public website/templates are retained for compatibility.

## Important
Firebase Realtime Database Security Rules were not included in the ZIP, so they must be audited separately before production deployment.

\n## Legacy service compatibility update\n- Reads the original `servis` root first.\n- Detects legacy service records recursively if an extra grouping level exists.\n- Falls back to `services` / `service` only when `servis` has no recognizable records.\n- Preserves the Firebase path for edit/delete.\n- Logs the number of service records discovered to the browser console.\n

## OnePrint POS v4 — revisi operasional
- Scanner barcode/QR terintegrasi di dashboard, form servis, dan daftar servis.
- Pembacaan inventori dibuat kompatibel dengan data bertingkat dan seluruh kategori.
- Logout selalu kembali ke `login.html`.
- Nota dan tanda terima mengikuti struktur cetak asli: kop, data pelanggan, tabel invoice, tracking + QR, catatan, tanda tangan.
- Sidebar diganti menjadi bottom navigation bergaya aplikasi untuk memperluas area kerja di mobile.
- Restock: menambah stok sekaligus membuat catatan pengeluaran.
- Akuntansi sederhana: pemasukan servis saat status `DIAMBIL`, pengeluaran restock, transaksi manual, dan laporan bulanan.
- Filter servis operasional: bulan berjalan + satu bulan sebelumnya. Record lebih lama tetap tampil jika status belum `DIAMBIL`/`CANCEL`.
- Setiap perubahan penting menampilkan toast notifikasi.

## Surface bug fix
- Service table rendering self-creates a missing tbody instead of aborting.
- Added Cetak Ulang Tanda Terima and Cetak Ulang Invoice.
- Reprint only reads the existing Firebase record and prints it. It does not save, change inventory, or create accounting entries.

## Final surface fix
- Service list now self-creates its table/tbody when an old cached app.html lacks it.
- Printing restored to the original OnePrint print layout from the original `js/print.js` + print CSS.
- Reprint remains read-only: it fetches the existing service and prints without saving, stock mutation, or ledger creation.


## OnePrint POS V2.9 — mobile print + printer identity
- Printer barcode/QR is treated as a persistent printer identity, not as a service/invoice search code.
- New printer records are stored under `printers/{barcode}` while existing `pelanggan/{serial}` data remains compatible.
- A printer scan loads its owner, printer details, and recent service history into the service form.
- Service records store `printerId` so one physical printer can be linked to multiple service transactions.
- Restock now has client-side search by name, code, brand, serial, or category.
- Sidebar uses the logged-in Firebase display name/email username and the logout action is red.
- The dashboard period explanation was removed; the existing two-month/unfinished-service filtering logic remains in the service module.
- Print/reprint no longer uses `window.open()`. It uses an off-screen print iframe to avoid mobile `about:blank` popup failures.
- The receipt template markup was left intact. The missing print CSS dependency was restored locally inside `receipt.js`.
- Reprint remains read-only and does not call `saveService`, inventory mutation, or accounting writes.


## Accounting fix (2026-09-22)
- Pemasukan servis dicatat berdasarkan waktu status berubah menjadi DIAMBIL (`diambilAt`), bukan tanggal awal servis.
- Key ledger servis deterministik per nomor servis, sehingga penyimpanan ulang tidak membuat transaksi pemasukan ganda.
- Laporan tetap mengenali servis DIAMBIL dari versi lama yang belum mempunyai ledger, tanpa double-counting.


## Accounting revision
Built from oneprint-v20f6 baseline. Finance calculations derive service income from DIAMBIL payment date, while manual/restock ledger rows remain in keuangan. Manual ledger supports create/edit/delete. Inventory and accounting tables use horizontal scrolling on narrow screens; receipt table headers are centered, bold, black.


## Pemeliharaan Database
Menu Tools sekarang menggantikan shortcut website publik dengan Pemeliharaan Data. Kandidat cleanup hanya servis DIAMBIL/CANCEL yang lebih dari 3 bulan. Servis aktif tidak dihapus. Tersedia preview, export backup JSON, dan cleanup dengan konfirmasi ganda.


Print reliability fix: receipt container is no longer cleared in afterprint because Android Chrome can fire afterprint while the preview is opening. Print now waits for fonts/images and two animation frames before window.print(). Receipt logo path is corrected to assets/logos.png and receipt module URL is cache-busted.
