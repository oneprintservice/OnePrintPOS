# OnePrint Printer Bridge

Bridge lokal untuk mengirim struk ESC/POS dari OnePrint POS ke printer thermal.

## Transport yang didukung

- **Windows / Spooler**: printer terpasang sebagai printer Windows, gunakan `winspool`.
- **Linux / CUPS**: printer terpasang sebagai antrian CUPS di Linux (termasuk USB), gunakan `cups`.
- **Wi-Fi / LAN**: printer thermal yang menerima RAW ESC/POS di TCP `9100`, gunakan `network`.
- **Serial / Bluetooth klasik**: perangkat yang tersedia sebagai COM/TTY, gunakan `serial`.

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
- Windows / Spooler → isi **Nama printer Windows**
- Linux / CUPS → isi **Nama antrian printer CUPS** (bisa dilihat dengan `lpstat -p`)
- Wi-Fi / LAN → isi IP printer, port biasanya `9100`
- Serial / Bluetooth → isi `COM3`, `COM4`, `/dev/ttyUSB0`, `/dev/ttyACM0`, dll.

> Untuk koneksi dari HP ke bridge di PC melalui Wi-Fi LAN, bridge perlu di-bind ke alamat LAN (mis. `HOST=0.0.0.0`) dan firewall Windows harus mengizinkan port 18181. Chrome modern dapat meminta izin Local Network karena halaman OnePrint adalah HTTPS.


## Linux / CUPS

Pastikan CUPS aktif dan printer sudah terdaftar di MX Linux. Untuk melihat nama antrian:

```bash
lpstat -p
```

Contoh:

```text
printer POS-80C is idle. enabled since ...
```

Maka di OnePrint pilih:

- Mode: `Thermal via Bridge`
- Transport: `Linux / CUPS (USB)`
- Nama antrian printer CUPS: `POS-80C`

Bridge akan meneruskan byte ESC/POS ke antrian CUPS menggunakan transport CUPS bawaan `@maxxuxx/node-printer`. CUPS mendukung printer lokal USB dan antrian printer jaringan di Linux. 
