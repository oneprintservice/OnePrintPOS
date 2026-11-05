ONEPRINT PRINT TEST — ADD-ONLY PATCH
=====================================

Isi:
- print-test.html                 : halaman publik Basic Mono + Basic Color
- service-tools/diagnostic.html   : halaman diagnostic teknisi (tidak ditautkan publik)
- assets/print-test/print-test.css
- assets/print-test/print-test.js

Pemasangan:
1. Ekstrak ZIP ini ke root project website (folder yang sama dengan index.html).
2. Pastikan struktur folder mengikuti path di atas.
3. Buka /print-test.html untuk halaman publik.
4. Buka /service-tools/diagnostic.html untuk pola teknisi.

Tautan opsional pada landing page:
Tambahkan tautan berikut di area tombol/layanan index.html:
<a href="print-test.html">Printer Test Gratis</a>

Catatan:
- Patch ini tidak mengubah index.html, login.html, app.html, Firebase, manifest, service worker, atau konfigurasi Cloudflare.
- Diagnostic page tidak ditautkan dari halaman publik. URL yang tidak ditautkan bukan proteksi akses.
- Pola adalah alat bantu visual, bukan perintah self-test/nozzle check resmi.
- Desain SVG memakai kanvas A4 portrait. Browser/driver tetap menentukan printer, media, tray, skala, kualitas, dan opsi warna.
- Sebelum deploy, uji print preview dan hasil fisik. Pada dialog cetak pilih A4, skala 100%/Actual Size, dan matikan header/footer browser bila opsi tersedia. Aplikasi tidak memaksa perubahan driver.
- Tidak ada backend, database, atau dependency eksternal.

PENYEMPURNAAN v4:
- Lingkaran RGB dan CMY diperkecil dan diposisikan ulang agar seluruh tepi lingkaran berada di dalam bingkai diagram.
- Warna irisan RGB dan CMY kini digambar sebagai area overlap dengan clipping SVG dan warna hasil campuran yang ditentukan langsung; tidak bergantung pada CSS mix-blend-mode yang dapat berbeda antar-browser/driver.
- Pusat RGB berwarna putih; pusat CMY berwarna hitam teoritis. Sampel K tetap terpisah.
- Keterangan kalimat hasil campuran warna di bawah diagram dihilangkan; label primer R/G/B dan C/M/Y tetap ada.
- Dot pattern pada mode diagnostic dipindahkan ke dalam panelnya sendiri, tidak bertabrakan dengan footer, dan semua titik berada di dalam bingkai.
- Perbaikan berlaku pada halaman publik dan teknisi karena keduanya menggunakan renderer JS yang sama.
