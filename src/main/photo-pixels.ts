/**
 * A check of the pixels of a profile photo. This module needs no Electron, so that unit
 * tests can use it.
 */

/**
 * True when every pixel of the bitmap is fully transparent, so the photo shows nothing.
 * Shifted then keeps no photo, and the avatar shows the first letter of the account name.
 *
 * @param bitmap Raw pixels with 4 bytes each, alpha last, as `nativeImage.toBitmap` gives.
 */
export function isBlankBitmap(bitmap: Uint8Array): boolean {
  for (let alpha = 3; alpha < bitmap.length; alpha += 4) {
    if (bitmap[alpha] !== 0) return false
  }
  return true
}
