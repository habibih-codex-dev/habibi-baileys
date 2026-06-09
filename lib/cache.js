'use strict';

/**
 * MemoryManager
 * --------------
 * Cache in-memory anti memory leak. Dipakai buat nyimpen message store,
 * dedupe id pesan, dan data sementara lain tanpa bikin RAM server bengkak.
 *
 * Mekanisme pembersihan:
 *  1. TTL  -> tiap entry punya umur, lewat itu dianggap basi dan dibuang.
 *  2. maxSize (LRU) -> kalau jumlah entry lewat batas, yang paling lama
 *     diakses dibuang duluan.
 *  3. Sweep berkala -> interval timer ngebersihin entry yang udah expired
 *     biar nggak nunggu diakses dulu.
 */
class MemoryManager {
  /**
   * @param {object} [opts]
   * @param {number} [opts.ttl=600000]            Umur entry dalam ms (default 10 menit).
   * @param {number} [opts.maxSize=2000]          Maksimum jumlah entry.
   * @param {number} [opts.sweepInterval=120000]  Interval sweep otomatis dalam ms (default 2 menit).
   * @param {string} [opts.name='cache']          Label buat logging.
   */
  constructor(opts = {}) {
    this.ttl = opts.ttl ?? 10 * 60 * 1000;
    this.maxSize = opts.maxSize ?? 2000;
    this.sweepInterval = opts.sweepInterval ?? 2 * 60 * 1000;
    this.name = opts.name ?? 'cache';

    /** @type {Map<string, { value: any, expires: number }>} */
    this.store = new Map();
    this._timer = null;

    this._startSweeper();
  }

  _startSweeper() {
    if (this._timer || this.sweepInterval <= 0) return;
    this._timer = setInterval(() => this.sweep(), this.sweepInterval);
    // Jangan nahan process node tetap hidup cuma gara-gara timer ini.
    if (typeof this._timer.unref === 'function') this._timer.unref();
  }

  /**
   * Simpan value dengan key tertentu.
   * @param {string} key
   * @param {*} value
   * @param {number} [ttl] TTL khusus buat entry ini (ms). Default pakai TTL global.
   */
  set(key, value, ttl) {
    // LRU: hapus dulu biar re-insert pindah ke posisi paling baru.
    if (this.store.has(key)) this.store.delete(key);

    this.store.set(key, {
      value,
      expires: Date.now() + (ttl ?? this.ttl),
    });

    // Evict entry tertua kalau lewat batas ukuran.
    while (this.store.size > this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    return value;
  }

  /**
   * Ambil value. Otomatis null kalau nggak ada / udah expired.
   * Akses yang valid bakal "menyegarkan" posisi LRU-nya.
   * @param {string} key
   * @returns {*|null}
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }

    // Refresh posisi LRU (move to end).
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  /** @param {string} key */
  has(key) {
    return this.get(key) !== null;
  }

  /** @param {string} key */
  delete(key) {
    return this.store.delete(key);
  }

  /** Kosongin semua cache. */
  clear() {
    this.store.clear();
  }

  /** Jumlah entry yang masih valid sekarang. */
  get size() {
    return this.store.size;
  }

  /**
   * Bersihin semua entry yang udah expired. Dipanggil otomatis lewat timer,
   * tapi bisa juga dipanggil manual.
   * @returns {number} jumlah entry yang dibuang.
   */
  sweep() {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expires) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Matiin sweeper + kosongin cache. WAJIB dipanggil pas shutdown bot
   * biar timer nggak nyangkut dan RAM kelepas.
   */
  destroy() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    this.clear();
  }
}

module.exports = { MemoryManager };
