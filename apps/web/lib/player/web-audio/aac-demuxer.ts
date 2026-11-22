type Box = { type: string; start: number; body: number; end: number };

function boxes(bytes: Uint8Array, start = 0, end = bytes.length): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result: Box[] = [];
  for (let offset = start; offset < end; ) {
    if (offset + 8 > end) throw new Error("Truncated MP4 box");
    let size = view.getUint32(offset);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) throw new Error("Truncated MP4 extended size");
      size = view.getUint32(offset + 8) * 2 ** 32 + view.getUint32(offset + 12);
      header = 16;
    } else if (size === 0) size = end - offset;
    if (!Number.isSafeInteger(size) || size < header || offset + size > end) {
      throw new Error("Invalid MP4 box size");
    }
    result.push({
      type: String.fromCharCode(...bytes.subarray(offset + 4, offset + 8)),
      start: offset,
      body: offset + header,
      end: offset + size,
    });
    offset += size;
  }
  return result;
}

function child(bytes: Uint8Array, box: Box, type: string): Box {
  const found = boxes(bytes, box.body, box.end).find(
    (value) => value.type === type,
  );
  if (!found) throw new Error(`Missing MP4 ${type}`);
  return found;
}

function descriptor(bytes: Uint8Array, start: number, end: number) {
  let offset = start + 1;
  let length = 0;
  for (let index = 0; index < 4; index += 1) {
    if (offset >= end) throw new Error("Truncated AAC descriptor");
    const value = bytes[offset++];
    length = length * 128 + (value & 127);
    if (!(value & 128)) {
      if (offset + length > end) throw new Error("Invalid AAC descriptor size");
      return { tag: bytes[start], body: offset, end: offset + length };
    }
  }
  throw new Error("Invalid AAC descriptor length");
}

export type AacConfiguration = {
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  description: Uint8Array<ArrayBuffer>;
  timescale: number;
  trackId: number;
  defaultDuration: number;
  defaultSize: number;
};

export function readAacConfiguration(data: ArrayBuffer): AacConfiguration {
  const bytes = new Uint8Array(data);
  const view = new DataView(data);
  const moov = boxes(bytes).find((box) => box.type === "moov");
  if (!moov) throw new Error("Missing MP4 initialization metadata");
  const track = child(bytes, moov, "trak");
  const tkhd = child(bytes, track, "tkhd");
  const trackId = view.getUint32(
    tkhd.body + (bytes[tkhd.body] === 1 ? 20 : 12),
  );
  const mdia = child(bytes, track, "mdia");
  const mdhd = child(bytes, mdia, "mdhd");
  const timescale = view.getUint32(
    mdhd.body + (bytes[mdhd.body] === 1 ? 20 : 12),
  );
  const stbl = child(bytes, child(bytes, mdia, "minf"), "stbl");
  const stsd = child(bytes, stbl, "stsd");
  const entry = boxes(bytes, stsd.body + 8, stsd.end)[0];
  if (!entry || entry.type !== "mp4a" || entry.body + 28 > entry.end) {
    throw new Error("Only AAC audio tracks are supported");
  }
  const numberOfChannels = view.getUint16(entry.body + 16);
  const sampleRate = view.getUint32(entry.body + 24) >>> 16;
  const esds = boxes(bytes, entry.body + 28, entry.end).find(
    (box) => box.type === "esds",
  );
  if (!esds) throw new Error("Missing AAC decoder configuration");
  const es = descriptor(bytes, esds.body + 4, esds.end);
  if (es.tag !== 3) throw new Error("Invalid AAC ES descriptor");
  const flags = bytes[es.body + 2];
  let offset = es.body + 3;
  if (flags & 128) offset += 2;
  if (flags & 64) offset += 1 + bytes[offset];
  if (flags & 32) offset += 2;
  const decoder = descriptor(bytes, offset, es.end);
  if (decoder.tag !== 4 || bytes[decoder.body] !== 0x40) {
    throw new Error("Unsupported AAC object type");
  }
  const specific = descriptor(bytes, decoder.body + 13, decoder.end);
  if (specific.tag !== 5 || specific.end - specific.body < 2) {
    throw new Error("Invalid AAC AudioSpecificConfig");
  }
  const objectType = bytes[specific.body] >>> 3;
  if (objectType !== 2 || !timescale || !sampleRate || !numberOfChannels) {
    throw new Error("Only AAC-LC configuration is supported");
  }
  const trex = child(bytes, child(bytes, moov, "mvex"), "trex");
  if (view.getUint32(trex.body + 4) !== trackId)
    throw new Error("Mismatched AAC track");
  return {
    codec: "mp4a.40.2",
    sampleRate,
    numberOfChannels,
    timescale,
    trackId,
    description: bytes.slice(specific.body, specific.end),
    defaultDuration: view.getUint32(trex.body + 12),
    defaultSize: view.getUint32(trex.body + 16),
  };
}

export type AacPacket = {
  timestamp: number;
  duration: number;
  data: Uint8Array;
};

export function readAacPackets(
  data: ArrayBuffer,
  configuration: AacConfiguration,
  fileOffset: number,
): AacPacket[] {
  const bytes = new Uint8Array(data);
  const view = new DataView(data);
  const top = boxes(bytes);
  const packets: AacPacket[] = [];
  for (const moof of top.filter((box) => box.type === "moof")) {
    const traf = child(bytes, moof, "traf");
    const tfhd = child(bytes, traf, "tfhd");
    const flags = view.getUint32(tfhd.body) & 0xffffff;
    if (view.getUint32(tfhd.body + 4) !== configuration.trackId)
      throw new Error("Mismatched AAC fragment track");
    let position = tfhd.body + 8;
    let base = moof.start;
    if (flags & 1) {
      base =
        view.getUint32(position) * 2 ** 32 +
        view.getUint32(position + 4) -
        fileOffset;
      position += 8;
    }
    if (flags & 2) position += 4;
    const defaultDuration =
      flags & 8 ? view.getUint32(position) : configuration.defaultDuration;
    if (flags & 8) position += 4;
    const defaultSize =
      flags & 16 ? view.getUint32(position) : configuration.defaultSize;
    const tfdt = child(bytes, traf, "tfdt");
    let time =
      bytes[tfdt.body] === 1
        ? view.getUint32(tfdt.body + 4) * 2 ** 32 +
          view.getUint32(tfdt.body + 8)
        : view.getUint32(tfdt.body + 4);
    let cursor = top.find(
      (box) => box.type === "mdat" && box.start >= moof.end,
    )?.body;
    for (const trun of boxes(bytes, traf.body, traf.end).filter(
      (box) => box.type === "trun",
    )) {
      const sampleFlags = view.getUint32(trun.body) & 0xffffff;
      const count = view.getUint32(trun.body + 4);
      let entry = trun.body + 8;
      if (sampleFlags & 1) {
        cursor = base + view.getInt32(entry);
        entry += 4;
      }
      if (sampleFlags & 4) entry += 4;
      for (let index = 0; index < count; index += 1) {
        const duration =
          sampleFlags & 0x100 ? view.getUint32(entry) : defaultDuration;
        if (sampleFlags & 0x100) entry += 4;
        const size = sampleFlags & 0x200 ? view.getUint32(entry) : defaultSize;
        if (sampleFlags & 0x200) entry += 4;
        if (sampleFlags & 0x400) entry += 4;
        let compositionOffset = 0;
        if (sampleFlags & 0x800) {
          compositionOffset =
            bytes[trun.body] === 1
              ? view.getInt32(entry)
              : view.getUint32(entry);
          entry += 4;
        }
        if (
          !duration ||
          !size ||
          cursor === undefined ||
          cursor < 0 ||
          cursor + size > bytes.length ||
          entry > trun.end
        ) {
          throw new Error("Invalid AAC sample bounds");
        }
        packets.push({
          timestamp: Math.round(
            ((time + compositionOffset) * 1e6) / configuration.timescale,
          ),
          duration: Math.round((duration * 1e6) / configuration.timescale),
          data: bytes.subarray(cursor, cursor + size),
        });
        cursor += size;
        time += duration;
      }
    }
  }
  if (!packets.length) throw new Error("No AAC samples in media fragment");
  return packets;
}
