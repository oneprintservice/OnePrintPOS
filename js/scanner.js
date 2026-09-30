        // ===============================
        // SCANNER BARCODE STABIL V2
        // ===============================
        
        let html5Qr = null;
        let scannerActive = false;
        
        const readerDiv = document.getElementById('reader');
        const btnScan = document.getElementById('btn-scan');
        
        async function startScanner() {
        
            readerDiv.classList.remove('hidden');
        
            // reset isi lama
            readerDiv.innerHTML = "";
        
            html5Qr = new Html5Qrcode("reader");
        
            scannerActive = true;
        
            try {
        
                await html5Qr.start(
                    {
                        facingMode: "environment"
                    },
                    {
                        fps: 30,
        
                        qrbox: function(viewfinderWidth, viewfinderHeight) {
        
                            let minEdge =
                                Math.min(viewfinderWidth, viewfinderHeight);
        
                            let qrSize =
                                Math.floor(minEdge * 0.85);
        
                            return {
                                width: qrSize,
                                height: qrSize / 2
                            };
                        },
        
                        aspectRatio: 1.777,
        
                        disableFlip: false,
        
                        experimentalFeatures: {
                            useBarCodeDetectorIfSupported: true
                        },
        
                        formatsToSupport: [
                            Html5QrcodeSupportedFormats.CODE_128,
                            Html5QrcodeSupportedFormats.CODE_39,
                            Html5QrcodeSupportedFormats.CODE_93,
                            Html5QrcodeSupportedFormats.CODABAR,
                            Html5QrcodeSupportedFormats.EAN_13,
                            Html5QrcodeSupportedFormats.EAN_8,
                            Html5QrcodeSupportedFormats.QR_CODE
                        ]
                    },
        
                    async (decodedText) => {
        
                        // vibrate jika support
                        if (navigator.vibrate) {
                            navigator.vibrate(120);
                        }
        
                        // efek flash hijau
                        readerDiv.style.boxShadow =
                            "0 0 20px lime";
        
                        setTimeout(() => {
                            readerDiv.style.boxShadow = "none";
                        }, 400);
        
                        // isi barcode
                        barcodeInput.value =
                            decodedText.trim();
        
                        // auto isi data
                        isiDataOtomatis(decodedText);
        
                        // bunyi sukses
                        try {
                            new Audio(
                                'https://www.soundjay.com/button/beep-07.mp3'
                            ).play();
                        } catch(e){}
        
                        // stop kamera TANPA destroy object
                        await stopScanner();
                    },
        
                    (errorMessage) => {
                        // abaikan error scan realtime
                    }
                );
        
            } catch(err) {
        
                console.error(err);
        
                alert(
                    "Gagal membuka kamera"
                );
        
                scannerActive = false;
            }
        }
        
        async function stopScanner() {
        
            if (
                html5Qr &&
                scannerActive
            ) {
        
                try {
        
                    await html5Qr.stop();
                    await html5Qr.clear();
        
                } catch(err) {
                    console.log(err);
                }
        
                scannerActive = false;
                html5Qr = null;
            }
        
            readerDiv.classList.add('hidden');
        }
        
        btnScan.addEventListener('click', async () => {
        
            if(scannerActive){
        
                await stopScanner();
        
            } else {
        
                await startScanner();
        
            }
        
        });
