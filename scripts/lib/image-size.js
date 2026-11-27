/**
 * Minimal, dependency-free image dimension reader.
 *
 * Reads pixel width/height from the file header for the formats Notion
 * "Poster images" can contain: PNG, JPEG, GIF, WebP. Returns null for
 * anything it can't parse so callers can fall back gracefully.
 *
 * Intentionally pure Node (no native deps): the Netlify build runs
 * `fetch:all && build` in a Node-only environment, so measuring has to
 * work there without Python/Pillow. See netlify.toml.
 */

export function imageSize(buf) {
  if (!buf || buf.length < 24) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A, then IHDR with width/height as BE uint32.
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // GIF: "GIF87a" / "GIF89a", width/height as LE uint16 at offset 6/8.
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // WebP: RIFF....WEBP + a VP8 / VP8L / VP8X chunk.
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    const fmt = buf.toString('ascii', 12, 16);
    if (fmt === 'VP8 ') { // lossy: 2 bytes tag then 14-bit dims
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fmt === 'VP8L') { // lossless: dims packed after 0x2f signature byte
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      };
    }
    if (fmt === 'VP8X') { // extended: 24-bit dims minus one at offset 24/27
      return {
        width: 1 + ((buf[24]) | (buf[25] << 8) | (buf[26] << 16)),
        height: 1 + ((buf[27]) | (buf[28] << 8) | (buf[29] << 16)),
      };
    }
    return null;
  }

  // JPEG: FF D8, then walk segments to a Start-Of-Frame marker.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) { off++; continue; }
      const marker = buf[off + 1];
      // SOF markers carry the frame dimensions (skip DHT/DAC/RST/SOS etc).
      if (marker >= 0xc0 && marker <= 0xcf &&
          marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
      }
      // Standalone markers (no length payload): RSTn and TEM.
      if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { off += 2; continue; }
      const len = buf.readUInt16BE(off + 2);
      if (len < 2) return null;
      off += 2 + len;
    }
    return null;
  }

  return null;
}
