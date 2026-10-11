INTEGRASI LABEL PHOMEMO T02 - BETA

Cara mencoba:
1. Deploy ZIP ini ke environment beta (HTTPS wajib untuk Web Bluetooth).
2. Buka app.html di Chrome Android dan buka form servis.
3. Isi/scan ID Unit / Barcode Unit.
4. Tekan "Cetak Label Unit (T02)".
5. Pada halaman label, cek ID unit, tekan "Hubungkan T02", lalu pilih printer dari dialog Bluetooth.
6. Tekan "Buat Preview", cek QR dan ID, lalu "Cetak Label".

Catatan:
- Halaman label menggunakan area cetak 384 x 240 titik (48 x 30 mm), sesuai lebar cetak nominal T02 48 mm.
- QR berisi ID unit saja.
- Protokol M02/T02 diadaptasi dari proyek Phomymo open-source, tetapi pengiriman cetak belum diuji pada perangkat fisik oleh pengembang ZIP ini. Uji satu label dulu di beta.
- Cetak membutuhkan Chrome/Chromium Android, HTTPS, Bluetooth aktif, dan printer tidak sedang tersambung eksklusif ke aplikasi lain.
- Fitur printer dokumen/bridge existing tidak diubah.
