/**
 * Contoh pemakaian (ES Modules).
 * Jalanin: node example/bot.mjs
 */

import { createBot } from '../esm/index.mjs'; // di project lu: from 'habibi-cloud-baileys'

const bot = await createBot({
  authFolder: './auth',
  printQR: true,
});

bot.on('pairing', (code) => console.log('Pairing code:', code));
bot.on('open', () => console.log('Bot tersambung (ESM)!'));

bot.on('message', async (m, sock) => {
  if (m.fromMe || !m.body) return;

  if (m.body.toLowerCase() === 'menu') {
    await sock.sendButton(m.from, {
      text: 'Halo dari ESM 👋',
      footer: 'habibi-cloud-baileys',
      buttons: [{ type: 'reply', text: 'Tes', id: 'tes' }],
    }, { quoted: m.raw });
  }
});
