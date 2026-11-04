ONEPRINT PRINT TEST — PATCH v7

Patch lanjutan dari baseline gabungan v4 + v5 + v6.

Perubahan v7:
- CMYK halftone dot pattern dibuat lebih renggang.
- Diameter titik diperkecil agar setiap titik terlihat sebagai bulatan
  terpisah dan tidak menyatu menjadi garis/batang.
- Empat kelompok tinta C, M, Y, K tetap ditampilkan dalam panel teknisi.

Pemasangan:
1. Backup file assets/print-test/print-test.js yang sekarang.
2. Ganti hanya file assets/print-test/print-test.js dengan file dari patch ini.
3. HTML dan CSS dari baseline sebelumnya tetap digunakan.
4. Uji preview dan cetak A4 sebelum diterapkan ke produksi.
