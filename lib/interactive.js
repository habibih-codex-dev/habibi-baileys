'use strict';

const { getBaileys } = require('./loader');

/**
 * interactive.js
 * --------------
 * Builder + sender buat pesan interaktif WhatsApp modern (native flow):
 *   - Button Message   (quick reply, url, call, copy)
 *   - List Message     (single select / menu)
 *   - Carousel Message (kartu geser dengan gambar + tombol)
 *
 * Semua dibangun langsung dari proto.Message.InteractiveMessage lalu dikirim
 * pakai relayMessage, jadi nggak tergantung helper high-level Baileys yang
 * sering berubah antar versi.
 */

/**
 * Ubah satu definisi tombol jadi format nativeFlow button.
 * @param {object} btn
 * @param {'reply'|'url'|'call'|'copy'} btn.type
 * @param {string} btn.text  label tombol
 * @param {string} [btn.id]  id (buat reply / copy)
 * @param {string} [btn.url] url (buat type url)
 * @param {string} [btn.phone] nomor telepon (buat type call)
 * @param {string} [btn.copyCode] kode yang dicopy (buat type copy)
 * @returns {{name: string, buttonParamsJson: string}}
 */
function buildNativeButton(btn) {
  switch (btn.type) {
    case 'url':
      return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
          display_text: btn.text,
          url: btn.url,
          merchant_url: btn.url,
        }),
      };
    case 'call':
      return {
        name: 'cta_call',
        buttonParamsJson: JSON.stringify({
          display_text: btn.text,
          phone_number: btn.phone,
        }),
      };
    case 'copy':
      return {
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
          display_text: btn.text,
          id: btn.id || btn.copyCode,
          copy_code: btn.copyCode,
        }),
      };
    case 'reply':
    default:
      return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: btn.text,
          id: btn.id || btn.text,
        }),
      };
  }
}

/**
 * Bikin header InteractiveMessage. Kalau ada media (image/video) bakal
 * di-upload dulu lewat prepareWAMessageMedia.
 * @param {import('baileys').WASocket} sock
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
async function buildHeader(sock, opts = {}) {
  const { proto, prepareWAMessageMedia } = getBaileys();
  const header = {
    title: opts.title || '',
    subtitle: opts.subtitle || '',
    hasMediaAttachment: false,
  };

  if (opts.image) {
    const media = await prepareWAMessageMedia(
      { image: typeof opts.image === 'string' ? { url: opts.image } : opts.image },
      { upload: sock.waUploadToServer },
    );
    Object.assign(header, media);
    header.hasMediaAttachment = true;
  } else if (opts.video) {
    const media = await prepareWAMessageMedia(
      { video: typeof opts.video === 'string' ? { url: opts.video } : opts.video },
      { upload: sock.waUploadToServer },
    );
    Object.assign(header, media);
    header.hasMediaAttachment = true;
  }

  return proto.Message.InteractiveMessage.Header.fromObject(header);
}

/**
 * Bungkus InteractiveMessage jadi WAMessage final lalu kirim via relayMessage.
 * @param {import('baileys').WASocket} sock
 * @param {string} jid
 * @param {object} interactiveMessage instance proto InteractiveMessage
 * @param {object} [options]
 * @param {object} [options.quoted] pesan yang mau di-quote
 */
async function relayInteractive(sock, jid, interactiveMessage, options = {}) {
  const { generateWAMessageFromContent } = getBaileys();
  const content = generateWAMessageFromContent(
    jid,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
          },
          interactiveMessage,
        },
      },
    },
    { userJid: sock.user?.id, quoted: options.quoted },
  );

  await sock.relayMessage(jid, content.message, {
    messageId: content.key.id,
    ...options.relayOptions,
  });

  return content;
}

/**
 * Kirim Button Message.
 * @param {import('baileys').WASocket} sock
 * @param {string} jid
 * @param {object} params
 * @param {string} params.text   isi utama
 * @param {string} [params.footer]
 * @param {string} [params.title]
 * @param {string} [params.subtitle]
 * @param {string|object} [params.image] url/objek gambar header
 * @param {Array<object>} params.buttons daftar tombol (lihat buildNativeButton)
 * @param {object} [options] { quoted }
 */
async function sendButton(sock, jid, params, options = {}) {
  const { proto } = getBaileys();
  const header = await buildHeader(sock, params);
  const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
    body: { text: params.text || '' },
    footer: { text: params.footer || '' },
    header,
    nativeFlowMessage: {
      buttons: (params.buttons || []).map(buildNativeButton),
    },
  });
  return relayInteractive(sock, jid, interactiveMessage, options);
}

/**
 * Kirim List Message (menu single-select).
 * @param {import('baileys').WASocket} sock
 * @param {string} jid
 * @param {object} params
 * @param {string} params.text
 * @param {string} [params.footer]
 * @param {string} [params.title]
 * @param {string} [params.buttonText='Pilih menu'] teks tombol pembuka list
 * @param {Array<{title: string, rows: Array<{title: string, description?: string, id?: string, header?: string}>}>} params.sections
 * @param {object} [options] { quoted }
 */
async function sendList(sock, jid, params, options = {}) {
  const { proto } = getBaileys();
  const sections = (params.sections || []).map((section) => ({
    title: section.title || '',
    rows: (section.rows || []).map((row) => ({
      header: row.header || '',
      title: row.title || '',
      description: row.description || '',
      id: row.id || row.title || '',
    })),
  }));

  const header = await buildHeader(sock, params);
  const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
    body: { text: params.text || '' },
    footer: { text: params.footer || '' },
    header,
    nativeFlowMessage: {
      buttons: [
        {
          name: 'single_select',
          buttonParamsJson: JSON.stringify({
            title: params.buttonText || 'Pilih menu',
            sections,
          }),
        },
      ],
    },
  });

  return relayInteractive(sock, jid, interactiveMessage, options);
}

/**
 * Bikin satu kartu carousel.
 * @param {import('baileys').WASocket} sock
 * @param {object} card
 * @returns {Promise<object>}
 */
async function buildCard(sock, card) {
  const header = await buildHeader(sock, {
    image: card.image,
    video: card.video,
    title: card.title,
    subtitle: card.subtitle,
  });

  return {
    header,
    body: { text: card.text || card.body || '' },
    footer: { text: card.footer || '' },
    nativeFlowMessage: {
      buttons: (card.buttons || []).map(buildNativeButton),
    },
  };
}

/**
 * Kirim Carousel Message (beberapa kartu geser).
 * @param {import('baileys').WASocket} sock
 * @param {string} jid
 * @param {object} params
 * @param {string} params.text
 * @param {string} [params.footer]
 * @param {Array<object>} params.cards daftar kartu (lihat buildCard)
 * @param {object} [options] { quoted }
 */
async function sendCarousel(sock, jid, params, options = {}) {
  const { proto } = getBaileys();
  const cards = await Promise.all((params.cards || []).map((c) => buildCard(sock, c)));

  const interactiveMessage = proto.Message.InteractiveMessage.fromObject({
    body: { text: params.text || '' },
    footer: { text: params.footer || '' },
    carouselMessage: {
      cards,
    },
  });

  return relayInteractive(sock, jid, interactiveMessage, options);
}

module.exports = {
  sendButton,
  sendList,
  sendCarousel,
  buildNativeButton,
  buildHeader,
  relayInteractive,
};
