'use strict';

const { EventEmitter } = require('events');
const P = require('pino');

const { loadBaileys } = require('./loader');
const { MemoryManager } = require('./cache');
const { serializeMessage } = require('./serializer');
const { sendButton, sendList, sendCarousel } = require('./interactive');

/**
 * createBot
 * ---------
 * Bikin instance bot WhatsApp yang udah lengkap:
 *   - Auto-reconnect dengan exponential backoff.
 *   - Pairing code 8 digit (login tanpa scan QR).
 *   - Anti memory leak lewat MemoryManager (message store + dedupe).
 *   - Pesan masuk otomatis di-serialize jadi objek `m`.
 *   - Helper sendButton / sendList / sendCarousel nempel di socket.
 *
 * Return-nya EventEmitter. Event yang dipancarkan:
 *   - 'qr'        (qrString)            -> string QR buat ditampilkan
 *   - 'pairing'   (code)                -> pairing code 8 digit
 *   - 'connecting'                      -> lagi nyambung / nyoba ulang
 *   - 'open'      (sock)                -> berhasil konek
 *   - 'close'     ({ reason, reconnecting })
 *   - 'logout'                          -> sesi di-logout, perlu login ulang
 *   - 'message'   (m, sock)             -> pesan masuk yang udah di-serialize
 *   - 'raw'       (event, payload)      -> event mentah Baileys (passthrough)
 *
 * @param {object} [options]
 * @param {string}  [options.authFolder='./auth']  folder penyimpanan kredensial.
 * @param {boolean} [options.printQR=true]         tampilin QR di terminal otomatis.
 * @param {string}  [options.phoneNumber]          nomor (format internasional tanpa +) buat pairing code.
 * @param {boolean} [options.usePairingCode=false] pakai pairing code, bukan QR.
 * @param {string}  [options.pairingCustomCode]    custom pairing code (opsional, harus valid sesuai aturan WA).
 * @param {number}  [options.maxReconnectAttempts=Infinity] batas percobaan reconnect.
 * @param {object}  [options.memory]               opsi MemoryManager (ttl, maxSize, sweepInterval).
 * @param {object}  [options.browser]              identitas browser, default Browsers.macOS('Desktop').
 * @param {object}  [options.logger]               instance pino custom (opsional).
 * @param {object}  [options.socketConfig]         override config mentah makeWASocket.
 * @returns {Promise<EventEmitter & { sock: import('baileys').WASocket, stop: Function, memory: MemoryManager }>}
 */
async function createBot(options = {}) {
  // Muat Baileys lebih dulu (robust terhadap CJS / ESM-only via loader).
  const B = await loadBaileys();
  const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    DisconnectReason,
    Browsers,
  } = B;

  const config = {
    authFolder: options.authFolder ?? './auth',
    printQR: options.printQR ?? true,
    phoneNumber: options.phoneNumber,
    usePairingCode: options.usePairingCode ?? false,
    pairingCustomCode: options.pairingCustomCode,
    maxReconnectAttempts: options.maxReconnectAttempts ?? Infinity,
    memory: options.memory ?? {},
    browser: options.browser ?? Browsers.macOS('Desktop'),
    socketConfig: options.socketConfig ?? {},
  };

  const logger = options.logger ?? P({ level: process.env.WA_LOG_LEVEL || 'silent' });
  const emitter = new EventEmitter();

  // ---- Anti memory leak ----
  // store : nyimpen pesan terbaru (dipakai buat ambil ulang pas decode gagal).
  // dedupe: nyimpen id pesan yang udah diproses biar nggak dobel.
  const memory = new MemoryManager({ name: 'wa-store', ...config.memory });
  const dedupe = new MemoryManager({
    name: 'wa-dedupe',
    ttl: 5 * 60 * 1000,
    maxSize: 5000,
    sweepInterval: 60 * 1000,
  });

  let reconnectAttempts = 0;
  let stopped = false;
  let currentSock = null;
  let pairingRequested = false;

  const handle = Object.assign(emitter, {
    sock: null,
    memory,
    /** Hentiin bot + bersihin semua resource biar RAM kelepas. */
    async stop() {
      stopped = true;
      memory.destroy();
      dedupe.destroy();
      try {
        currentSock?.ws?.close();
      } catch {
        /* abaikan */
      }
    },
  });

  async function connect() {
    if (stopped) return;
    emitter.emit('connecting');

    const { state, saveCreds } = await useMultiFileAuthState(config.authFolder);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger,
      browser: config.browser,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      // Ambil ulang pesan dari store sendiri kalau ada decode gagal.
      getMessage: async (key) => {
        const stored = memory.get(key.id);
        return stored?.message || undefined;
      },
      ...config.socketConfig,
    });

    currentSock = sock;
    handle.sock = sock;

    // Tempelin helper interaktif ke socket biar enak dipanggil.
    sock.sendButton = (jid, params, opts) => sendButton(sock, jid, params, opts);
    sock.sendList = (jid, params, opts) => sendList(sock, jid, params, opts);
    sock.sendCarousel = (jid, params, opts) => sendCarousel(sock, jid, params, opts);

    sock.ev.on('creds.update', saveCreds);

    // ---- Pairing code 8 digit ----
    // Diminta sekali pas belum teregistrasi dan QR belum kebaca.
    if (config.usePairingCode && !sock.authState.creds.registered && !pairingRequested) {
      pairingRequested = true;
      if (!config.phoneNumber) {
        emitter.emit('error', new Error('usePairingCode aktif tapi options.phoneNumber kosong.'));
      } else {
        // Kasih jeda sebentar biar socket siap sebelum minta code.
        setTimeout(async () => {
          try {
            const number = String(config.phoneNumber).replace(/[^0-9]/g, '');
            const code = await sock.requestPairingCode(number, config.pairingCustomCode);
            emitter.emit('pairing', code);
          } catch (err) {
            emitter.emit('error', err);
          }
        }, 3000);
      }
    }

    // ---- Update koneksi + auto-reconnect ----
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        emitter.emit('qr', qr);
        if (config.printQR) {
          try {
            require('qrcode-terminal').generate(qr, { small: true });
          } catch {
            /* qrcode-terminal opsional */
          }
        }
      }

      if (connection === 'open') {
        reconnectAttempts = 0;
        pairingRequested = false;
        emitter.emit('open', sock);
      }

      if (connection === 'close') {
        const statusCode =
          lastDisconnect?.error?.output?.statusCode ??
          lastDisconnect?.error?.output?.payload?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        if (loggedOut) {
          emitter.emit('logout');
          emitter.emit('close', { reason: 'logout', reconnecting: false });
          return;
        }

        const canRetry = !stopped && reconnectAttempts < config.maxReconnectAttempts;
        emitter.emit('close', { reason: statusCode, reconnecting: canRetry });

        if (canRetry) {
          reconnectAttempts++;
          // Exponential backoff: 2s, 4s, 8s ... maksimum 30s.
          const delay = Math.min(2000 * 2 ** (reconnectAttempts - 1), 30000);
          setTimeout(() => connect().catch((e) => emitter.emit('error', e)), delay);
        }
      }
    });

    // ---- Pesan masuk ----
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const raw of messages) {
        if (!raw.message) continue;

        // Anti dobel: skip kalau id-nya udah pernah diproses.
        const id = raw.key?.id;
        if (id) {
          if (dedupe.has(id)) continue;
          dedupe.set(id, true);
          // Simpan ke store buat getMessage (anti decode gagal).
          memory.set(id, raw);
        }

        const m = serializeMessage(sock, raw);
        if (m) emitter.emit('message', m, sock);
      }
    });

    // Passthrough event mentah biar developer bisa pasang handler sendiri.
    sock.ev.process((events) => {
      for (const [name, payload] of Object.entries(events)) {
        emitter.emit('raw', name, payload);
      }
    });

    return sock;
  }

  await connect();
  return handle;
}

module.exports = { createBot };
