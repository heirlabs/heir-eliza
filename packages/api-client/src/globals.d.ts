/**
 * Global type declarations for browser/Node.js runtime.
 */

declare function setTimeout(callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]): ReturnType<typeof globalThis.setTimeout>;
declare function setInterval(callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]): ReturnType<typeof globalThis.setInterval>;
declare function clearTimeout(id: ReturnType<typeof setTimeout> | undefined | null): void;
declare function clearInterval(id: ReturnType<typeof setInterval> | undefined | null): void;

declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
};

declare class Buffer {
  static from(data: string | ArrayBuffer | Uint8Array, encoding?: string): Buffer;
  toString(encoding?: string): string;
}

declare function fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
