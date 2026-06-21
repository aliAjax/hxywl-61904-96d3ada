class MemoryStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys());
    return index >= 0 && index < keys.length ? keys[index] : null;
  }
}

(globalThis as any).localStorage = new MemoryStorage();
(globalThis as any).sessionStorage = new MemoryStorage();

import { Buffer } from "node:buffer";

if (typeof (globalThis as any).btoa !== "function") {
  (globalThis as any).btoa = (str: string) => {
    return Buffer.from(str, "binary").toString("base64");
  };
}

if (typeof (globalThis as any).atob !== "function") {
  (globalThis as any).atob = (str: string) => {
    return Buffer.from(str, "base64").toString("binary");
  };
}

import { createGzip, createGunzip } from "node:zlib";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

async function compressBytes(data: Uint8Array): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const readable = Readable.from(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });
  await pipeline(readable, createGzip(), writable);
  return new Uint8Array(Buffer.concat(chunks));
}

async function decompressBytes(data: Uint8Array): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const readable = Readable.from(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });
  await pipeline(readable, createGunzip(), writable);
  return new Uint8Array(Buffer.concat(chunks));
}

class NodeCompressionStream {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;

  constructor(format: string) {
    if (format !== "gzip") {
      throw new Error(`Unsupported compression format: ${format}`);
    }
    const inputChunks: Uint8Array[] = [];
    this.writable = new WritableStream({
      write: (chunk) => {
        inputChunks.push(new Uint8Array(chunk));
      },
      close: async () => {
        const totalLen = inputChunks.reduce((s, c) => s + c.length, 0);
        const merged = new Uint8Array(totalLen);
        let off = 0;
        for (const c of inputChunks) {
          merged.set(c, off);
          off += c.length;
        }
        const result = await compressBytes(merged);
        (this as any)._result = result;
      },
    });
    this.readable = new ReadableStream({
      start: (controller) => {
        const origClose = (this.writable as any)._underlyingSink.close;
        (this.writable as any)._underlyingSink.close = async () => {
          await origClose();
          controller.enqueue((this as any)._result);
          controller.close();
        };
      },
    });
  }
}

class NodeDecompressionStream {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;

  constructor(format: string) {
    if (format !== "gzip") {
      throw new Error(`Unsupported compression format: ${format}`);
    }
    const inputChunks: Uint8Array[] = [];
    this.writable = new WritableStream({
      write: (chunk) => {
        inputChunks.push(new Uint8Array(chunk));
      },
      close: async () => {
        const totalLen = inputChunks.reduce((s, c) => s + c.length, 0);
        const merged = new Uint8Array(totalLen);
        let off = 0;
        for (const c of inputChunks) {
          merged.set(c, off);
          off += c.length;
        }
        const result = await decompressBytes(merged);
        (this as any)._result = result;
      },
    });
    this.readable = new ReadableStream({
      start: (controller) => {
        const origClose = (this.writable as any)._underlyingSink.close;
        (this.writable as any)._underlyingSink.close = async () => {
          await origClose();
          controller.enqueue((this as any)._result);
          controller.close();
        };
      },
    });
  }
}

(globalThis as any).CompressionStream = NodeCompressionStream;
(globalThis as any).DecompressionStream = NodeDecompressionStream;

if (typeof (globalThis as any).TextEncoder !== "function") {
  (globalThis as any).TextEncoder = class {
    encode(str: string): Uint8Array {
      return new Uint8Array(Buffer.from(str, "utf-8"));
    }
  };
}

if (typeof (globalThis as any).TextDecoder !== "function") {
  (globalThis as any).TextDecoder = class {
    decode(bytes: Uint8Array): string {
      return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("utf-8");
    }
  };
}
