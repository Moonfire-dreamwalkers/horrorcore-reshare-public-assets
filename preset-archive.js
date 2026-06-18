"use strict";

(function () {
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writeUint16 = (view, offset, value) => view.setUint16(offset, value, true);
const writeUint32 = (view, offset, value) => view.setUint32(offset, value >>> 0, true);

const concatChunks = (chunks) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
};

const createPresetArchive = (entries) => {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes);
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, 0);
    writeUint16(localView, 12, 0);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, data.length);
    writeUint32(localView, 22, data.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);
    localChunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, 0);
    writeUint16(centralView, 14, 0);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, data.length);
    writeUint32(centralView, 24, data.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, offset);
    centralHeader.set(nameBytes, 46);
    centralChunks.push(centralHeader);

    offset += localHeader.length + data.length;
  });

  const centralDirectory = concatChunks(centralChunks);
  const localData = concatChunks(localChunks);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  writeUint32(eocdView, 0, 0x06054b50);
  writeUint16(eocdView, 4, 0);
  writeUint16(eocdView, 6, 0);
  writeUint16(eocdView, 8, entries.length);
  writeUint16(eocdView, 10, entries.length);
  writeUint32(eocdView, 12, centralDirectory.length);
  writeUint32(eocdView, 16, localData.length);
  writeUint16(eocdView, 20, 0);

  return new Blob([localData, centralDirectory, eocd], { type: "application/zip" });
};

const findEocdOffset = (bytes) => {
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (
      bytes[i] === 0x50 &&
      bytes[i + 1] === 0x4b &&
      bytes[i + 2] === 0x05 &&
      bytes[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
};

const readPresetArchive = async (file) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const eocdOffset = findEocdOffset(bytes);
  if (eocdOffset === -1) {
    throw new Error("Preset archive end record not found.");
  }

  const eocdView = new DataView(bytes.buffer, bytes.byteOffset + eocdOffset, 22);
  const centralCount = eocdView.getUint16(10, true);
  const centralOffset = eocdView.getUint32(16, true);
  const files = new Map();
  let offset = centralOffset;

  for (let i = 0; i < centralCount; i += 1) {
    const centralView = new DataView(bytes.buffer, bytes.byteOffset + offset, 46);
    if (centralView.getUint32(0, true) !== 0x02014b50) {
      throw new Error("Preset archive central directory is invalid.");
    }

    const compressionMethod = centralView.getUint16(10, true);
    if (compressionMethod !== 0) {
      throw new Error("Preset archive uses unsupported compression.");
    }

    const fileNameLength = centralView.getUint16(28, true);
    const extraLength = centralView.getUint16(30, true);
    const commentLength = centralView.getUint16(32, true);
    const localHeaderOffset = centralView.getUint32(42, true);
    const nameBytes = bytes.slice(offset + 46, offset + 46 + fileNameLength);
    const name = decoder.decode(nameBytes);

    const localView = new DataView(bytes.buffer, bytes.byteOffset + localHeaderOffset, 30);
    if (localView.getUint32(0, true) !== 0x04034b50) {
      throw new Error("Preset archive local header is invalid.");
    }

    const localNameLength = localView.getUint16(26, true);
    const localExtraLength = localView.getUint16(28, true);
    const size = centralView.getUint32(24, true);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    files.set(name, bytes.slice(dataOffset, dataOffset + size));

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return files;
};

const stringToBytes = (value) => encoder.encode(value);
const bytesToString = (bytes) => decoder.decode(bytes);

window.PresetArchive = {
  createPresetArchive,
  readPresetArchive,
  stringToBytes,
  bytesToString
};
})();
