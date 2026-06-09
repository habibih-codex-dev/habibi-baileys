'use strict';

/**
 * habibi-cloud-baileys
 * --------------------
 * Entry point CommonJS. Semua API publik di-expose dari sini.
 *
 * Catatan v7: Baileys (@whiskeysockets/baileys) berpotensi ESM-only, jadi
 * kita TIDAK me-`require` Baileys saat modul ini dimuat. Pemuatan dilakukan
 * secara lazy lewat loader. Util Baileys yang sering dipakai (proto,
 * DisconnectReason, dll) di-expose sebagai getter: aksesnya baru memuat /
 * membaca Baileys setelah `loadBaileys()` (atau `createBot()`) dipanggil.
 */

const { loadBaileys, getBaileys, PACKAGE_NAME } = require('./loader');
const { createBot } = require('./socket');
const { MemoryManager } = require('./cache');
const { serializeMessage, extractText, unwrapMessage } = require('./serializer');
const {
  sendButton,
  sendList,
  sendCarousel,
  buildNativeButton,
  buildHeader,
  relayInteractive,
} = require('./interactive');

const api = {
  // Core
  createBot,
  MemoryManager,

  // Loader Baileys (buat pemakaian lanjutan / passthrough manual)
  loadBaileys,
  getBaileys,
  PACKAGE_NAME,

  // Serializer
  serializeMessage,
  extractText,
  unwrapMessage,

  // Interaktif
  sendButton,
  sendList,
  sendCarousel,
  buildNativeButton,
  buildHeader,
  relayInteractive,
};

// Passthrough Baileys yang sering dipakai — lazy via getter.
// Baru bisa diakses setelah loadBaileys()/createBot() dipanggil.
const LAZY = ['proto', 'jidNormalizedUser', 'jidDecode', 'delay', 'DisconnectReason', 'Browsers', 'downloadMediaMessage'];
for (const key of LAZY) {
  Object.defineProperty(api, key, {
    enumerable: true,
    configurable: true,
    get() {
      return getBaileys()[key];
    },
  });
}

// Akses penuh ke Baileys mentah (ternormalisasi) setelah dimuat.
Object.defineProperty(api, 'baileys', {
  enumerable: true,
  configurable: true,
  get() {
    return getBaileys();
  },
});

module.exports = api;
