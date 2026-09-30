OnePrint v21 - Final tracking + restock fix

Perbaikan utama:
1. Tracking manual memakai kembali lookup service yang sudah terbukti bekerja.
   Mendukung nomor bare, TT-..., INV-..., field legacy, dan parameter URL:
   tt, no, nota, nomor, invoice, code.
2. Tracking QR:
   - opsi manual dan scan kamera
   - kamera belakang/environment diutamakan
   - fallback untuk browser Android yang menolak facingMode
   - library scanner dimuat ulang bila CDN awal gagal
   - QR berisi URL tracking juga diparsing
   - kamera berhenti setelah QR berhasil dibaca
3. Restock:
   - semua baris riwayat yang memiliki key mendapat tombol Hapus
   - restock normal: stok dikurangi + record restock dihapus + semua ledger RESTOCK terkait dihapus
   - riwayat legacy tanpa item linkage tetap dapat dihapus tanpa menebak item inventori
   - ledger-only legacy dapat dihapus; stok tidak diubah karena tidak ada hubungan item yang aman
   - stok tidak boleh menjadi negatif
   - UI membaca ulang Firebase setelah operasi normal

Catatan:
- Tidak mengubah alur scanner printer, servis, receipt/print, atau accounting service.
- Syntax JS diperiksa dengan Node --check.
