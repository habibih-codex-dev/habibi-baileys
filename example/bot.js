'use strict';

/**
 * Contoh pemakaian (CommonJS).
 * Jalanin: node example/bot.js
 *
 * Ganti USE_PAIRING jadi true + isi PHONE_NUMBER kalau mau login pakai
 * pairing code 8 digit (tanpa scan QR).
 */

const { createBot } = require('..'); // di project lu: require('habibi-baileys')

const USE_PAIRING = false;
const PHONE_NUMBER = '628xxxxxxxxxx'; // format internasional tanpa tanda +

async function main() {
  const bot = await createBot({
    authFolder: './auth',
    usePairingCode: USE_PAIRING,
    phoneNumber: PHONE_NUMBER,
    printQR: true,
    memory: { ttl: 10 * 60 * 1000, maxSize: 3000 },
  });

  bot.on('qr', () => console.log('Scan QR di atas pakai WhatsApp lu.'));
  bot.on('pairing', (code) => console.log('Pairing code (masukin di HP):', code));
  bot.on('open', () => console.log('Bot tersambung!'));
  bot.on('close', (info) => console.log('Koneksi tertutup:', info));
  bot.on('logout', () => console.log('Sesi logout, hapus folder ./auth lalu login ulang.'));

  bot.on('message', async (m, sock) => {
    if (m.fromMe || !m.body) return;
    const cmd = m.body.trim().toLowerCase();

    if (cmd === 'ping') {
      await m.reply('pong');
    }

    if (cmd === 'button') {
      await sock.sendButton(m.from, {
        text: 'Pilih salah satu tombol:',
        footer: 'habibi-baileys',
        buttons: [
          { type: 'reply', text: 'Halo', id: 'cmd_halo' },
          { type: 'url', text: 'Buka GitHub', url: 'https://github.com' },
          { type: 'copy', text: 'Copy Kode', copyCode: 'PROMO2026' },
        ],
      }, { quoted: m.raw });
    }

    if (cmd === 'list') {
      await sock.sendList(m.from, {
        text: 'Menu utama bot:',
        footer: 'habibi-baileys',
        buttonText: 'Lihat Menu',
        sections: [
          {
            title: 'Umum',
            rows: [
              { title: 'Ping', description: 'Cek bot hidup', id: 'ping' },
              { title: 'Info', description: 'Info bot', id: 'info' },
            ],
          },
        ],
      }, { quoted: m.raw });
    }

    if (cmd === 'carousel') {
      await sock.sendCarousel(m.from, {
        text: 'Geser kartunya 👇',
        footer: 'habibi-baileys',
        cards: [
          {
            title: 'Produk A',
            text: 'Deskripsi produk A',
            image: 'https://picsum.photos/seed/a/600/400',
            buttons: [{ type: 'reply', text: 'Beli A', id: 'beli_a' }],
          },
          {
            title: 'Produk B',
            text: 'Deskripsi produk B',
            image: 'https://picsum.photos/seed/b/600/400',
            buttons: [{ type: 'reply', text: 'Beli B', id: 'beli_b' }],
          },
        ],
      }, { quoted: m.raw });
    }
  });

  // Bersih-bersih pas process dimatiin (penting buat anti memory leak).
  process.on('SIGINT', async () => {
    await bot.stop();
    process.exit(0);
  });
}

main().catch(console.error);
