// Modified by TaraWeb: propagate early gzip cancellation to the compressed source.
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { setInputAdapters } from "./input.js";

setInputAdapters({
  readFileChunks(path) {
    return createReadStream(path) as AsyncIterable<unknown>;
  },
  async *decompressGzip(chunks) {
    const source = Readable.from(chunks, { highWaterMark: 1 });
    const streamOptions = { chunkSize: 1024, writableHighWaterMark: 1024, readableHighWaterMark: 1024 };
    const gunzip = createGunzip(streamOptions);
    source.on("error", error => gunzip.destroy(error));
    source.pipe(gunzip);
    try { for await (const chunk of gunzip) yield chunk; }
    finally { source.destroy(); gunzip.destroy(); }
  },
});

