// Generates the PWA icons (192, 512, maskable 512) without any image library:
// draws a simple floor-plan glyph into an RGBA buffer and encodes it as PNG.
// Run: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = [37, 99, 235, 255] // #2563eb
const FG = [255, 255, 255, 255]

function encodePng(width, height, rgba) {
  const crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, crcBuf])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  const scanlines = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4)
    scanlines[rowStart] = 0 // no filter
    rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function drawIcon(size, { padded }) {
  const buf = Buffer.alloc(size * size * 4)
  const set = (x, y, [r, g, b, a]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    buf[i] = r
    buf[i + 1] = g
    buf[i + 2] = b
    buf[i + 3] = a
  }
  const fillRect = (x0, y0, x1, y1, color) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
      for (let x = Math.round(x0); x < Math.round(x1); x++) set(x, y, color)
    }
  }

  fillRect(0, 0, size, size, BG)

  // floor-plan glyph: outer rectangle, inner wall with a door gap —
  // kept inside the maskable safe zone when padded
  const inset = padded ? size * 0.24 : size * 0.16
  const t = Math.max(3, size * 0.045) // wall thickness
  const left = inset
  const top = inset
  const right = size - inset
  const bottom = size - inset

  fillRect(left, top, right, top + t, FG)
  fillRect(left, bottom - t, right, bottom, FG)
  fillRect(left, top, left + t, bottom, FG)
  fillRect(right - t, top, right, bottom, FG)
  // inner vertical wall at 55% with a door gap in the middle
  const wallX = left + (right - left) * 0.55
  const gapTop = top + (bottom - top) * 0.4
  const gapBottom = top + (bottom - top) * 0.68
  fillRect(wallX, top, wallX + t, gapTop, FG)
  fillRect(wallX, gapBottom, wallX + t, bottom, FG)

  return encodePng(size, size, buf)
}

mkdirSync('public', { recursive: true })
writeFileSync('public/pwa-192.png', drawIcon(192, { padded: false }))
writeFileSync('public/pwa-512.png', drawIcon(512, { padded: false }))
writeFileSync('public/pwa-maskable-512.png', drawIcon(512, { padded: true }))
console.log('icons written to public/')
