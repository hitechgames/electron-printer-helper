# HiTech Printer Helper

Helper locale (Electron) per stampa immediata da applicazione Laravel.

Funzioni:
- Servizio locale su http://127.0.0.1:17171
- GET /cert -> certificato pubblico auto-generato
- POST /sign { request } -> firma SHA512 base64
- GET /printers -> elenco stampanti
- POST /print { base64pdf, printerName? } -> stampa silenziosa

Avvio sviluppo
- npm install
- npm start

Build
- npm run dist

Integrazione frontend
- Carica certificato da http://127.0.0.1:17171/cert
- Firma tramite POST http://127.0.0.1:17171/sign
- Per stampare: POST http://127.0.0.1:17171/print
