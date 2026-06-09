import type { WASocket, WAMessage, proto as BaileysProto } from '@whiskeysockets/baileys';
import type { EventEmitter } from 'events';

export interface MemoryManagerOptions {
  /** Umur entry dalam ms (default 600000 = 10 menit). */
  ttl?: number;
  /** Maksimum jumlah entry (default 2000). */
  maxSize?: number;
  /** Interval sweep otomatis dalam ms (default 120000 = 2 menit). */
  sweepInterval?: number;
  /** Label buat logging. */
  name?: string;
}

export class MemoryManager {
  constructor(opts?: MemoryManagerOptions);
  readonly size: number;
  set(key: string, value: unknown, ttl?: number): unknown;
  get<T = unknown>(key: string): T | null;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  sweep(): number;
  destroy(): void;
}

export type NativeButton =
  | { type: 'reply'; text: string; id?: string }
  | { type: 'url'; text: string; url: string }
  | { type: 'call'; text: string; phone: string }
  | { type: 'copy'; text: string; copyCode: string; id?: string };

export interface ListRow {
  title: string;
  description?: string;
  id?: string;
  header?: string;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

export interface InteractiveOptions {
  quoted?: WAMessage;
  relayOptions?: Record<string, unknown>;
}

export interface ButtonParams {
  text: string;
  footer?: string;
  title?: string;
  subtitle?: string;
  image?: string | Record<string, unknown>;
  video?: string | Record<string, unknown>;
  buttons: NativeButton[];
}

export interface ListParams {
  text: string;
  footer?: string;
  title?: string;
  buttonText?: string;
  sections: ListSection[];
}

export interface CarouselCard {
  text?: string;
  body?: string;
  footer?: string;
  title?: string;
  subtitle?: string;
  image?: string | Record<string, unknown>;
  video?: string | Record<string, unknown>;
  buttons?: NativeButton[];
}

export interface CarouselParams {
  text: string;
  footer?: string;
  cards: CarouselCard[];
}

export interface QuotedMessage {
  key: Record<string, unknown>;
  sender?: string;
  message: unknown;
  type?: string;
  body: string;
  text: string;
  download(type?: 'buffer' | 'stream'): Promise<unknown>;
}

/** Objek pesan masuk yang udah disederhanakan. */
export interface SerializedMessage {
  raw: WAMessage;
  key: WAMessage['key'];
  id?: string;
  fromMe: boolean;
  isGroup: boolean;
  from?: string;
  sender?: string;
  pushName: string;
  timestamp: number;
  message: unknown;
  type?: string;
  body: string;
  text: string;
  mentions: string[];
  quoted: QuotedMessage | null;
  reply(content: string | Record<string, unknown>, options?: Record<string, unknown>): Promise<WAMessage | undefined>;
  send(content: string | Record<string, unknown>, options?: Record<string, unknown>): Promise<WAMessage | undefined>;
  react(emoji: string): Promise<WAMessage | undefined>;
  download(type?: 'buffer' | 'stream'): Promise<unknown>;
}

/** Socket Baileys + helper interaktif tambahan. */
export type EnhancedSocket = WASocket & {
  sendButton(jid: string, params: ButtonParams, options?: InteractiveOptions): Promise<WAMessage>;
  sendList(jid: string, params: ListParams, options?: InteractiveOptions): Promise<WAMessage>;
  sendCarousel(jid: string, params: CarouselParams, options?: InteractiveOptions): Promise<WAMessage>;
};

export interface CreateBotOptions {
  authFolder?: string;
  printQR?: boolean;
  phoneNumber?: string;
  usePairingCode?: boolean;
  pairingCustomCode?: string;
  maxReconnectAttempts?: number;
  memory?: MemoryManagerOptions;
  browser?: [string, string, string];
  logger?: unknown;
  socketConfig?: Record<string, unknown>;
}

export interface BotHandle extends EventEmitter {
  sock: EnhancedSocket;
  memory: MemoryManager;
  stop(): Promise<void>;

  on(event: 'qr', listener: (qr: string) => void): this;
  on(event: 'pairing', listener: (code: string) => void): this;
  on(event: 'connecting', listener: () => void): this;
  on(event: 'open', listener: (sock: EnhancedSocket) => void): this;
  on(event: 'close', listener: (info: { reason: unknown; reconnecting: boolean }) => void): this;
  on(event: 'logout', listener: () => void): this;
  on(event: 'message', listener: (m: SerializedMessage, sock: EnhancedSocket) => void): this;
  on(event: 'raw', listener: (name: string, payload: unknown) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this;
}

export function createBot(options?: CreateBotOptions): Promise<BotHandle>;

/** Muat Baileys (robust CJS/ESM-only). Aman dipanggil berkali-kali. */
export function loadBaileys(): Promise<typeof import('@whiskeysockets/baileys')>;
/** Ambil Baileys yang sudah dimuat (sync). Lempar error jika belum dimuat. */
export function getBaileys(): typeof import('@whiskeysockets/baileys');
/** Nama paket Baileys yang dipakai (override via env BAILEYS_PACKAGE). */
export const PACKAGE_NAME: string;

export function serializeMessage(sock: WASocket, raw: WAMessage): SerializedMessage | null;
export function extractText(message: unknown): string;
export function unwrapMessage(message: unknown): unknown;

export function sendButton(sock: WASocket, jid: string, params: ButtonParams, options?: InteractiveOptions): Promise<WAMessage>;
export function sendList(sock: WASocket, jid: string, params: ListParams, options?: InteractiveOptions): Promise<WAMessage>;
export function sendCarousel(sock: WASocket, jid: string, params: CarouselParams, options?: InteractiveOptions): Promise<WAMessage>;
export function buildNativeButton(btn: NativeButton): { name: string; buttonParamsJson: string };
export function buildHeader(sock: WASocket, opts?: Record<string, unknown>): Promise<unknown>;
export function relayInteractive(sock: WASocket, jid: string, interactiveMessage: unknown, options?: InteractiveOptions): Promise<WAMessage>;

export const proto: typeof BaileysProto;
export const baileys: typeof import('@whiskeysockets/baileys');
