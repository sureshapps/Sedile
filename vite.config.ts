import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

/** Minimal PNG encoder (RGBA8, per-row "Up" filter) — used for the pre-computed RGBE environment. */
function encodePNG(width: number, height: number, rgba: Uint8Array) {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const o = y * (stride + 1)
    raw[o] = y === 0 ? 0 : 2
    for (let i = 0; i < stride; i++) {
      const v = rgba[y * stride + i]
      raw[o + 1 + i] = y === 0 ? v : (v - rgba[(y - 1) * stride + i]) & 255
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Dev-only endpoint used by the /studio route to save high-resolution
 * product renders (used as WebGL fallbacks and 2D thumbnails) into public/renders.
 */
function renderSink(): Plugin {
  return {
    name: 'render-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save-render', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        const name = String(new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? '')
        if (!/^[a-z0-9-]+\.(webp|png)$/.test(name)) { res.statusCode = 400; return res.end('bad name') }
        const chunks: Buffer[] = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          const dir = path.resolve(process.cwd(), 'public/renders')
          fs.mkdirSync(dir, { recursive: true })
          fs.writeFileSync(path.join(dir, name), Buffer.concat(chunks))
          res.end('ok')
        })
      })
      // raw RGBA8 (RGBE-encoded) environment atlas → PNG in public/env
      server.middlewares.use('/__save-env', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        const q = new URL(req.url ?? '', 'http://x').searchParams
        const w = Number(q.get('w')), h = Number(q.get('h'))
        const chunks: Buffer[] = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          const data = new Uint8Array(Buffer.concat(chunks))
          if (data.length !== w * h * 4) { res.statusCode = 400; return res.end('size mismatch') }
          const dir = path.resolve(process.cwd(), 'public/env')
          fs.mkdirSync(dir, { recursive: true })
          const png = encodePNG(w, h, data)
          fs.writeFileSync(path.join(dir, 'studio.rgbe.png'), png)
          res.end(String(png.length))
        })
      })
    },
  }
}

export default defineConfig({
  // '/' locally; the GitHub Pages workflow builds with BASE_PATH=/<repo>/
  base: process.env.BASE_PATH || '/',
  plugins: [react(), renderSink()],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three'
          if (/node_modules\/(react|react-dom|react-router|framer-motion|motion-|zustand|scheduler)/.test(id)) return 'vendor'
        },
      },
    },
  },
})
