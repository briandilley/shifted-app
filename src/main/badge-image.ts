/**
 * The small image of the app badge for the Windows taskbar overlay: a red circle with the
 * number in white. Shifted draws it in code, pixel by pixel, with a 3 by 5 pixel font.
 *
 * This module needs no Electron, so that unit tests can check the pixels.
 */

/** The size of the image in pixels. Shifted shows it at 16 by 16 points (scale factor 2). */
export const BADGE_IMAGE_SIZE = 32

/** The circle color, `#D93025`, in the byte order of a Windows bitmap (blue, green, red). */
const CIRCLE_BGR = [0x25, 0x30, 0xd9] as const

/** The glyphs of the 3 by 5 pixel font. Each string is one row, `1` is a pixel. */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000']
}

const GLYPH_WIDTH = 3
const GLYPH_HEIGHT = 5

export interface BadgeBitmap {
  width: number
  height: number
  /** Premultiplied BGRA pixels, row by row, as `nativeImage.createFromBitmap` takes them on Windows. */
  pixels: Buffer
}

/**
 * Draw the badge image for a text such as "7", "42", or "99+".
 *
 * @param text Digits and `+` only. Other characters are left out.
 */
export function drawBadgeBitmap(text: string, size = BADGE_IMAGE_SIZE): BadgeBitmap {
  const pixels = Buffer.alloc(size * size * 4)
  const center = size / 2
  const radius = size / 2

  // The circle, with a soft edge one pixel wide.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center)
      const alpha = Math.min(1, Math.max(0, radius - distance))
      if (alpha === 0) continue
      const offset = (y * size + x) * 4
      pixels[offset] = Math.round(CIRCLE_BGR[0] * alpha)
      pixels[offset + 1] = Math.round(CIRCLE_BGR[1] * alpha)
      pixels[offset + 2] = Math.round(CIRCLE_BGR[2] * alpha)
      pixels[offset + 3] = Math.round(255 * alpha)
    }
  }

  // The text, in the middle of the circle. Short texts get larger pixels.
  const glyphs = Array.from(text).flatMap((character) => {
    const glyph = GLYPHS[character]
    return glyph ? [glyph] : []
  })
  if (glyphs.length === 0) return { width: size, height: size, pixels }
  const scale = Math.max(1, Math.floor((glyphs.length <= 2 ? 3 : 2) * (size / BADGE_IMAGE_SIZE)))
  const gap = scale
  const textWidth = glyphs.length * GLYPH_WIDTH * scale + (glyphs.length - 1) * gap
  const textHeight = GLYPH_HEIGHT * scale
  const left = Math.round((size - textWidth) / 2)
  const top = Math.round((size - textHeight) / 2)

  glyphs.forEach((rows, index) => {
    const glyphLeft = left + index * (GLYPH_WIDTH * scale + gap)
    rows.forEach((row, rowIndex) => {
      Array.from(row).forEach((bit, columnIndex) => {
        if (bit !== '1') return
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const x = glyphLeft + columnIndex * scale + dx
            const y = top + rowIndex * scale + dy
            if (x < 0 || y < 0 || x >= size || y >= size) continue
            pixels.fill(255, (y * size + x) * 4, (y * size + x) * 4 + 4)
          }
        }
      })
    })
  })
  return { width: size, height: size, pixels }
}

/** The size of the unread badge on the tray icon, as a part of the icon size. */
export const TRAY_BADGE_PART = 0.75

/**
 * Draw the tray icon of Windows and Linux: the app icon with the badge of the total
 * unread count on its bottom-right corner. With no text, the icon stays as it is.
 *
 * @param icon The app icon at the size of the tray icon, as premultiplied BGRA pixels
 *   (`nativeImage.toBitmap`). It must be square.
 * @param text The text of the badge, for example "7" or "99+", or "" for no badge.
 */
export function drawTrayIconBitmap(icon: BadgeBitmap, text: string): BadgeBitmap {
  const pixels = Buffer.from(icon.pixels)
  if (text === '') return { width: icon.width, height: icon.height, pixels }
  const badgeSize = Math.round(icon.width * TRAY_BADGE_PART)
  const badge = drawBadgeBitmap(text, badgeSize)
  const left = icon.width - badgeSize
  const top = icon.height - badgeSize
  // Put the badge over the icon: premultiplied "source over".
  for (let y = 0; y < badgeSize; y++) {
    for (let x = 0; x < badgeSize; x++) {
      const from = (y * badgeSize + x) * 4
      const alpha = (badge.pixels[from + 3] ?? 0) / 255
      if (alpha === 0) continue
      const to = ((top + y) * icon.width + left + x) * 4
      for (let channel = 0; channel < 4; channel++) {
        const below = pixels[to + channel] ?? 0
        pixels[to + channel] = Math.round((badge.pixels[from + channel] ?? 0) + below * (1 - alpha))
      }
    }
  }
  return { width: icon.width, height: icon.height, pixels }
}
