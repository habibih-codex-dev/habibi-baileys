# habibi-cloud-baileys

Custom wrapper modular di atas [Baileys](https://github.com/WhiskeySockets/Baileys) buat bikin bot WhatsApp. Dirancang sebagai **core engine** project bot modular dan siap dipublish ke NPM.

## Fitur

- **Pesan Interaktif** — Button, List Message, dan Carousel via manipulasi Protobuf (native flow).
- **Message Serializer** — objek pesan masuk (`m`) langsung disederhanakan: `from`, `sender`, `body`, `quoted`, `reply()`, `react()`, `download()`, dll.
- **Auto-Reconnect** — nyambung ulang otomatis dengan exponential backoff.
- **Pairing Code 8 Digit** — login tanpa scan QR.
- **Anti Memory Leak** — `MemoryManager` dengan TTL, LRU eviction, dan sweep otomatis biar RAM server awet.
- **Dual Package** — bisa `require` (CommonJS) **dan** `import` (ES Modules) tanpa butuh bundler.

## Instalasi

```bash
npm install habibi-cloud-baileys
```

> Base engine: **`@whiskeysockets/baileys@^7.0.0-rc.13`** (v7 RC). `pino` & `qrcode-terminal` ikut ke-install. Butuh **Node.js >= 20**.
>
> ⚠️ **v7 = banyak breaking changes** dibanding v6 (auth/pairing, store dihapus, `printQRInTerminal` dihapus). Library ini sudah disesuaikan: QR di-handle lewat event, dan Baileys dimuat secara *robust* (otomatis fallback ke dynamic `import()` kalau v7 ternyata ESM-only).

### Ganti base engine (opsional)

Karena Baileys dimuat lewat loader, kamu bisa swap ke fork lain tanpa ubah kode — set env `BAILEYS_PACKAGE`:

```bash
BAILEYS_PACKAGE=ourin-baileys node index.js
# atau pakai paket "baileys" biasa:
BAILEYS_PACKAGE=baileys node index.js
```

(Pastikan paket pengganti udah ke-install.)

## Cara Pakai

### CommonJS

```js
const { createBot } = require('habibi-cloud-baileys');

const bot = await createBot({ authFolder: './auth', printQR: true });

bot.on('open', () => console.log('tersambung!'));
bot.on('message', async (m, sock) => {
  if (m.body === 'ping') await m.reply('pong');
});
```

### ES Modules

```js
import { createBot } from 'habibi-cloud-baileys';

const bot = await createBot({ authFolder: './auth' });
bot.on('message', (m) => console.log(m.sender, ':', m.body));
```

## Login pakai Pairing Code

```js
const bot = await createBot({
  usePairingCode: true,
  phoneNumber: '628xxxxxxxxxx', // internasional, tanpa +
});

bot.on('pairing', (code) => console.log('Masukin kode ini di HP:', code));
```

## Pesan Interaktif

```js
// Button
await sock.sendButton(jid, {
  text: 'Pilih:',
  footer: 'footer',
  buttons: [
    { type: 'reply', text: 'Halo', id: 'halo' },
    { type: 'url', text: 'Web', url: 'https://example.com' },
    { type: 'call', text: 'Telp', phone: '628xxx' },
    { type: 'copy', text: 'Copy', copyCode: 'KODE123' },
  ],
});

// List
await sock.sendList(jid, {
  text: 'Menu:',
  buttonText: 'Lihat Menu',
  sections: [{ title: 'Umum', rows: [{ title: 'Ping', id: 'ping' }] }],
});

// Carousel
await sock.sendCarousel(jid, {
  text: 'Geser:',
  cards: [
    { title: 'A', text: 'desc', image: 'https://.../a.jpg', buttons: [{ type: 'reply', text: 'Beli', id: 'a' }] },
  ],
});
```

## Gimana button / nativeflow bisa "muncul"?

Penting: **nggak ada flag `enableButtons: true` di `makeWASocket`.** Dukungan button/list/carousel itu datang dari **struktur protobuf pesannya**, bukan dari setting socket. Yang dilakukan library ini (di `lib/interactive.js`):

1. Pakai `proto.Message.InteractiveMessage` + `nativeFlowMessage` (quick_reply, cta_url, single_select, dll).
2. Bungkus dalam `viewOnceMessage` + isi `messageContextInfo.deviceListMetadataVersion = 2`.
3. Kirim via `relayMessage` (bukan helper high-level yang sering berubah).
4. Pakai versi WA Web terbaru via `fetchLatestBaileysVersion()`.

Kombinasi itulah yang bikin server WhatsApp mau me-render tombolnya. Kalau tetap nggak muncul di sebagian device, itu **kebijakan sisi WhatsApp** (bukan bug library) — coba update versi Baileys/fork, atau pakai fork yang proto-nya lebih baru lewat `BAILEYS_PACKAGE`.

## API Singkat

| API | Keterangan |
|-----|------------|
| `createBot(options)` | Bikin instance bot (EventEmitter). |
| `bot.sock` | Socket Baileys + helper `sendButton/sendList/sendCarousel`. |
| `bot.memory` | Instance `MemoryManager`. |
| `bot.stop()` | Matiin bot + bersihin resource. |
| Event: `qr`, `pairing`, `connecting`, `open`, `close`, `logout`, `message`, `raw`, `error` | |

### Opsi `createBot`

| Opsi | Default | Keterangan |
|------|---------|------------|
| `authFolder` | `./auth` | Folder kredensial. |
| `printQR` | `true` | Tampilin QR di terminal. |
| `usePairingCode` | `false` | Login pakai pairing code. |
| `phoneNumber` | — | Nomor buat pairing code. |
| `maxReconnectAttempts` | `Infinity` | Batas reconnect. |
| `memory` | `{}` | Opsi `MemoryManager` (`ttl`, `maxSize`, `sweepInterval`). |

## Publish ke NPM

```bash
npm login
# ganti "name" di package.json kalau "habibi-cloud-baileys" udah dipakai orang
npm publish
```

## Lisensi

MIT
