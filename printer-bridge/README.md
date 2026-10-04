# OnePrint Printer Bridge

Bridge lokal untuk mengirim struk ESC/POS dari OnePrint POS ke printer thermal.

## Transport yang didukung

- **USB / Windows**: printer terpasang sebagai printer Windows, gunakan `winspool`.
- **Wi-Fi / LAN**: printer thermal yang menerima RAW ESC/POS di TCP `9100`, gunakan `network`.
- **Bluetooth klasik**: pasangkan printer ke Windows sehingga muncul sebagai COM port, gunakan `serial`.

Browser tidak membuka TCP/USB/Bluetooth Classic secara langsung. Bridge ini menjadi penghubung lokal.

## Instalasi

Butuh Node.js 20+.

```bash
npm install
npm start
```

Default bridge:
`http://127.0.0.1:18181`

Opsional token keamanan:

Windows PowerShell:
```powershell
$env:ONEPRINT_BRIDGE_TOKEN="ganti-token-rahasia"
npm start
```

Lalu masukkan token yang sama di **OnePrint POS → Tools → Printer Thermal**.

## Pengaturan OnePrint

Mode:
`Thermal via Bridge`

Transport:
- USB / Windows → isi **Nama printer Windows**
- Wi-Fi / LAN → isi IP printer, port biasanya `9100`
- Bluetooth / COM → isi `COM3`, `COM4`, dll.

> Untuk koneksi dari HP ke bridge di PC melalui Wi-Fi LAN, bridge perlu di-bind ke alamat LAN (mis. `HOST=0.0.0.0`) dan firewall Windows harus mengizinkan port 18181. Chrome modern dapat meminta izin Local Network karena halaman OnePrint adalah HTTPS.
