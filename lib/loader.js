'use strict';

/**
 * loader.js
 * ---------
 * Pemuat Baileys yang tahan banting terhadap format modul.
 *
 * Baileys v7 (@whiskeysockets/baileys) berpotensi dipublish sebagai
 * ESM-only. Kalau itu kejadian, `require('@whiskeysockets/baileys')` dari
 * modul CommonJS bakal error (ERR_REQUIRE_ESM). Loader ini:
 *
 *   1. Coba `require()` dulu (paling cepat, jalan kalau Baileys masih CJS).
 *   2. Kalau gagal karena modul ESM, fallback ke `import()` dinamis
 *      (dynamic import valid dipanggil dari CommonJS).
 *   3. Normalisasi hasilnya jadi satu objek `B` yang konsisten, apa pun
 *      format aslinya, sehingga `B.makeWASocket`, `B.proto`, dst selalu ada.
 *
 * Karena `import()` itu async, modul yang butuh Baileys harus memanggil
 * `loadBaileys()` (async) minimal sekali sebelum pakai `getBaileys()` (sync).
 * `createBot()` melakukan ini otomatis di awal koneksi.
 */

// Nama paket dibikin konstanta biar gampang diganti kalau mau pakai fork
// (misal alias 'baileys' atau 'ourin-baileys').
const PACKAGE_NAME = process.env.BAILEYS_PACKAGE || '@whiskeysockets/baileys';

let cached = null;
let loadingPromise = null;

/**
 * Rapikan hasil import/require jadi objek dengan named export yang konsisten.
 * Menangani beberapa bentuk:
 *  - require(CJS)                -> { default: makeWASocket, proto, ... }
 *  - import(CJS) via Node interop-> { default: { default, proto, ... }, proto?, ... }
 *  - import(ESM murni)           -> { default: makeWASocket, proto, ... }
 * @param {object} mod
 * @returns {object}
 */
function normalize(mod) {
  let ns = mod;

  // Kasus import() terhadap modul CJS: named export asli "kebungkus" di .default.
  if (ns && ns.default && (ns.default.makeWASocket || ns.default.useMultiFileAuthState || ns.default.proto)) {
    ns = { ...ns.default, ...ns };
  }

  // Tentuin makeWASocket: bisa berupa default export (function) atau named export.
  const makeWASocket =
    (typeof ns.makeWASocket === 'function' && ns.makeWASocket) ||
    (typeof ns.default === 'function' && ns.default) ||
    (ns.default && typeof ns.default.default === 'function' && ns.default.default);

  // Gabungkan jadi satu objek datar. Spread named export, lalu pastiin
  // makeWASocket tersedia eksplisit.
  const flat = { ...ns };
  if (makeWASocket) flat.makeWASocket = makeWASocket;

  return flat;
}

/**
 * Muat Baileys (async). Aman dipanggil berkali-kali; hasilnya di-cache.
 * @returns {Promise<object>} objek Baileys ternormalisasi.
 */
async function loadBaileys() {
  if (cached) return cached;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    let mod;
    try {
      // Jalur cepat: Baileys masih CommonJS.
      mod = require(PACKAGE_NAME);
    } catch (err) {
      const esmError =
        err &&
        (err.code === 'ERR_REQUIRE_ESM' ||
          err.code === 'ERR_REQUIRE_ASYNC_MODULE' ||
          // Paket ESM-only yang exports-nya cuma punya kondisi "import"
          // (tanpa "require") bikin require() melempar ini.
          err.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED' ||
          /Must use import to load ES Module/i.test(err.message || ''));
      if (esmError) {
        // Jalur fallback: Baileys ESM-only -> pakai dynamic import.
        mod = await import(PACKAGE_NAME);
      } else {
        throw err;
      }
    }

    cached = normalize(mod);
    return cached;
  })();

  try {
    return await loadingPromise;
  } finally {
    loadingPromise = null;
  }
}

/**
 * Ambil Baileys yang udah dimuat (sync). Lempar error kalau belum dimuat.
 * Dipakai oleh modul util (serializer/interactive) yang baru jalan setelah
 * createBot() menghangatkan cache.
 * @returns {object}
 */
function getBaileys() {
  if (!cached) {
    throw new Error(
      "Baileys belum dimuat. Panggil `await loadBaileys()` dulu (createBot() melakukannya otomatis).",
    );
  }
  return cached;
}

module.exports = { loadBaileys, getBaileys, PACKAGE_NAME };
