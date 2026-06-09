'use strict';

const { getBaileys } = require('./loader');

/**
 * Ambil teks dari berbagai macam tipe pesan jadi satu string.
 * @param {object} message objek `message` dari WAMessage.
 * @returns {string}
 */
function extractText(message) {
  if (!message) return '';
  const { getContentType } = getBaileys();
  const type = getContentType(message);
  if (!type) return '';

  const content = message[type];

  switch (type) {
    case 'conversation':
      return content || '';
    case 'extendedTextMessage':
      return content?.text || '';
    case 'imageMessage':
    case 'videoMessage':
    case 'documentMessage':
      return content?.caption || '';
    case 'buttonsResponseMessage':
      return content?.selectedButtonId || content?.selectedDisplayText || '';
    case 'listResponseMessage':
      return content?.singleSelectReply?.selectedRowId || content?.title || '';
    case 'templateButtonReplyMessage':
      return content?.selectedId || content?.selectedDisplayText || '';
    case 'interactiveResponseMessage': {
      // Hasil klik native flow button (button/list/carousel modern).
      const params = content?.nativeFlowResponseMessage?.paramsJson;
      if (params) {
        try {
          const parsed = JSON.parse(params);
          return parsed.id || parsed.selectedId || parsed.display_text || '';
        } catch {
          return '';
        }
      }
      return '';
    }
    default:
      return content?.text || content?.caption || '';
  }
}

/**
 * Buka lapisan pembungkus (ephemeral / viewOnce) supaya dapet message inti.
 * @param {object} message
 * @returns {object}
 */
function unwrapMessage(message) {
  if (!message) return message;
  if (message.ephemeralMessage) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return unwrapMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.viewOnceMessageV2Extension) return unwrapMessage(message.viewOnceMessageV2Extension.message);
  if (message.documentWithCaptionMessage) return unwrapMessage(message.documentWithCaptionMessage.message);
  return message;
}

/**
 * Serialize satu WAMessage mentah jadi objek `m` yang gampang dipakai.
 *
 * Properti hasil:
 *  - key, id, isGroup, from (chat jid), sender, pushName, fromMe
 *  - type        : tipe konten (conversation, imageMessage, dst)
 *  - body / text : isi teks pesan
 *  - mentions    : array jid yang di-mention
 *  - quoted      : objek pesan yang di-reply (atau null)
 *  - reply(text) : balas pesan (auto quote)
 *  - react(emoji): kasih reaksi emoji
 *  - download()  : download media (return Buffer)
 *
 * @param {import('baileys').WASocket} sock
 * @param {object} raw WAMessage mentah dari event messages.upsert.
 * @returns {object|null}
 */
function serializeMessage(sock, raw) {
  if (!raw || !raw.message) return null;

  const { jidNormalizedUser, getContentType, downloadMediaMessage } = getBaileys();

  const m = {};
  m.raw = raw;
  m.key = raw.key;
  m.id = raw.key?.id;
  m.fromMe = !!raw.key?.fromMe;
  m.isGroup = (raw.key?.remoteJid || '').endsWith('@g.us');
  m.from = raw.key?.remoteJid;
  m.pushName = raw.pushName || '';
  m.timestamp = typeof raw.messageTimestamp === 'number'
    ? raw.messageTimestamp
    : raw.messageTimestamp?.low || Number(raw.messageTimestamp) || 0;

  // Pengirim asli: di grup pakai participant, di chat pribadi pakai remoteJid.
  const senderRaw = m.isGroup
    ? (raw.key?.participant || raw.participant)
    : raw.key?.remoteJid;
  m.sender = senderRaw ? jidNormalizedUser(senderRaw) : undefined;

  // Buka pembungkus dan tentuin tipe + isi.
  const inner = unwrapMessage(raw.message);
  m.message = inner;
  m.type = getContentType(inner);
  m.body = extractText(inner);
  m.text = m.body;

  // Mentions.
  const ctx = inner?.[m.type]?.contextInfo;
  m.mentions = ctx?.mentionedJid || [];

  // Pesan yang di-quote / reply.
  if (ctx?.quotedMessage) {
    const quotedInner = unwrapMessage(ctx.quotedMessage);
    m.quoted = {
      key: {
        remoteJid: m.from,
        fromMe: ctx.participant === jidNormalizedUser(sock?.user?.id || ''),
        id: ctx.stanzaId,
        participant: ctx.participant,
      },
      sender: ctx.participant ? jidNormalizedUser(ctx.participant) : undefined,
      message: quotedInner,
      type: getContentType(quotedInner),
      body: extractText(quotedInner),
    };
    m.quoted.text = m.quoted.body;
    m.quoted.download = (type = 'buffer') =>
      downloadMediaMessage(
        { key: m.quoted.key, message: m.quoted.message },
        type,
        {},
        { reuploadRequest: sock.updateMediaMessage },
      );
  } else {
    m.quoted = null;
  }

  // ---- Helper aksi cepat (cuma kalau socket dikasih) ----
  if (sock) {
    /**
     * Balas pesan ini (otomatis quote).
     * @param {string|object} content teks atau objek content Baileys.
     * @param {object} [options]
     */
    m.reply = (content, options = {}) => {
      const payload = typeof content === 'string' ? { text: content } : content;
      return sock.sendMessage(m.from, payload, { quoted: raw, ...options });
    };

    /**
     * Kirim pesan ke chat yang sama tanpa quote.
     */
    m.send = (content, options = {}) => {
      const payload = typeof content === 'string' ? { text: content } : content;
      return sock.sendMessage(m.from, payload, options);
    };

    /**
     * Kasih reaksi emoji ke pesan ini.
     * @param {string} emoji
     */
    m.react = (emoji) =>
      sock.sendMessage(m.from, { react: { text: emoji, key: raw.key } });

    /**
     * Download media dari pesan ini.
     * @param {'buffer'|'stream'} [type='buffer']
     */
    m.download = (type = 'buffer') =>
      downloadMediaMessage(
        raw,
        type,
        {},
        { reuploadRequest: sock.updateMediaMessage },
      );
  }

  return m;
}

module.exports = { serializeMessage, extractText, unwrapMessage };
