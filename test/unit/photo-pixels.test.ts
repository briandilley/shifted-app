import { describe, expect, it } from 'vitest'
import { isBlankBitmap } from '../../src/main/photo-pixels'

describe('isBlankBitmap', () => {
  it('is true when every pixel is fully transparent', () => {
    expect(isBlankBitmap(new Uint8Array([255, 255, 255, 0, 10, 20, 30, 0]))).toBe(true)
    expect(isBlankBitmap(new Uint8Array(0))).toBe(true)
  })

  it('is false when one pixel shows', () => {
    expect(isBlankBitmap(new Uint8Array([0, 0, 0, 0, 10, 20, 30, 1]))).toBe(false)
    expect(isBlankBitmap(new Uint8Array([10, 20, 30, 255]))).toBe(false)
  })
})
