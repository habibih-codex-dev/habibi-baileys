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

    // ============================================================
    // HANDLER KLIK TOMBOL (button / list / carousel)
    // ============================================================
    // Pas user nge-klik tombol, WhatsApp ngirim balik "response message".
    // Serializer kita otomatis ekstrak ID tombolnya ke `m.body`, dan
    // `m.type` jadi salah satu tipe response di bawah ini.
    //
    // CATATAN: cuma tombol "reply" (quick_reply) & pilihan "list" yang
    // ngirim balik respon ke bot. Tombol "url" & "call" cuma buka link/
    // telepon di HP user, jadi BOT NGGAK NERIMA apa-apa dari situ.
    // Tombol "copy" juga umumnya nggak ngirim balik.
    const RESPONSE_TYPES = [
      'interactiveResponseMessage', // native flow (button/list/carousel modern)
      'buttonsResponseMessage',     // button gaya lama
      'listResponseMessage',        // list gaya lama
      'templateButtonReplyMessage', // template button
    ];

    if (RESPONSE_TYPES.includes(m.type)) {
      const id = m.body; // ID tombol yang diklik (udah diekstrak serializer)
      console.log(`[KLIK] user ${m.sender} klik tombol id="${id}" (type=${m.type})`);

      switch (id) {
        case 'cmd_halo':
          await m.reply('Halo juga! 👋 Kamu barusan klik tombol "Halo".');
          break;
        case 'menu_ping':
          await m.reply('pong 🏓 (dari pilihan list)');
          break;
        case 'menu_info':
          await m.reply('habibi-baileys — core engine bot WhatsApp modular.');
          break;
        case 'beli_a':
          await m.reply('Kamu pilih *Produk A* ✅. Pesanan diproses!');
          break;
        case 'beli_b':
          await m.reply('Kamu pilih *Produk B* ✅. Pesanan diproses!');
          break;
        default:
          await m.reply(`Kamu klik tombol dengan id: *${id}*`);
      }
      return; // stop di sini biar klik nggak ikut diproses sebagai command teks
    }

    // ============================================================
    // HANDLER COMMAND TEKS BIASA
    // ============================================================
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
              { title: 'Ping', description: 'Cek bot hidup', id: 'menu_ping' },
              { title: 'Info', description: 'Info bot', id: 'menu_info' },
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
