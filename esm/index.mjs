/**
 * habibi-cloud-baileys
 * --------------------
 * Wrapper ESM. Core library ditulis dalam CommonJS, file ini jembatan supaya
 * bisa di-`import` dengan named export yang rapi.
 *
 *   import { createBot, sendButton } from 'habibi-cloud-baileys';
 *
 * Catatan v7: util mentah Baileys (proto, DisconnectReason, jidNormalizedUser,
 * dll) TIDAK di-export statis di sini, karena nilainya baru tersedia setelah
 * Baileys dimuat (berpotensi ESM-only). Ambil lewat:
 *
 *   import { loadBaileys, getBaileys } from 'habibi-cloud-baileys';
 *   const B = await loadBaileys();
 *   B.proto; B.DisconnectReason; // dst
 */

import core from '../lib/index.js';

// Hanya export anggota yang aman dibaca saat modul dievaluasi
// (fungsi-fungsi kita sendiri + loader). Passthrough Baileys yang lazy
// sengaja TIDAK didestrukturisasi agar getter-nya tidak ter-trigger lebih awal.
export const {
  createBot,
  MemoryManager,
  loadBaileys,
  getBaileys,
  PACKAGE_NAME,
  serializeMessage,
  extractText,
  unwrapMessage,
  sendButton,
  sendList,
  sendCarousel,
  buildNativeButton,
  buildHeader,
  relayInteractive,
} = core;

export default core;
