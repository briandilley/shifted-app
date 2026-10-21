import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import {
  parseProfilePhotoUrl,
  PROFILE_PHOTO_SELECTORS,
  profilePhotoScript
} from '../../src/main/gmail-page'

const SRC = resolve(__dirname, '../../src')

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? listFiles(path) : [path]
  })
}

interface FakeImage {
  src: string
  currentSrc: string
  getAttribute(name: string): string | null
}

/** Run the lookup script against a fake document that has these images per selector. */
async function runScript(images: Record<string, FakeImage[]>, timeoutMs = 0): Promise<unknown> {
  const document = {
    baseURI: 'https://mail.example/mail/u/0/',
    querySelectorAll: (selector: string): FakeImage[] => images[selector] ?? []
  }
  const run = new Function('document', `return ${profilePhotoScript(timeoutMs)}`) as (
    document: unknown
  ) => Promise<unknown>
  return run(document)
}

function image(src: string, srcset: string | null = null): FakeImage {
  return { src, currentSrc: src, getAttribute: (name) => (name === 'srcset' ? srcset : null) }
}

describe('gmail-page', () => {
  it('finds the photo in the account button first', async () => {
    const [first, second] = PROFILE_PHOTO_SELECTORS
    expect(first).toBe('a[href*="SignOutOptions"] img')
    const result = await runScript({
      [first ?? '']: [image('https://photos.example/a=s32')],
      [second ?? '']: [image('https://photos.example/b=s32')]
    })
    expect(result).toBe('https://photos.example/a=s32')
  })

  it('takes the largest image of the srcset', async () => {
    const result = await runScript({
      [PROFILE_PHOTO_SELECTORS[1] ?? '']: [
        image(
          'https://photos.example/a=s32',
          'https://photos.example/a=s32 1x, https://photos.example/a=s96 3x, /a=s64 2x'
        )
      ]
    })
    expect(result).toBe('https://photos.example/a=s96')
  })

  it('returns null when the page shows no photo before the time ends', async () => {
    expect(await runScript({})).toBeNull()
    expect(await runScript({ 'img.gbii': [image('data:image/png;base64,AAAA')] })).toBeNull()
  })

  it('accepts only http and https URLs from the page', () => {
    expect(parseProfilePhotoUrl('https://photos.example/a.png')).toBe(
      'https://photos.example/a.png'
    )
    expect(parseProfilePhotoUrl('http://127.0.0.1:4555/avatar.png')).toBe(
      'http://127.0.0.1:4555/avatar.png'
    )
    expect(parseProfilePhotoUrl('file:///etc/passwd')).toBeUndefined()
    expect(parseProfilePhotoUrl('javascript:alert(1)')).toBeUndefined()
    expect(parseProfilePhotoUrl(null)).toBeUndefined()
    expect(parseProfilePhotoUrl({ url: 'https://photos.example/a.png' })).toBeUndefined()
    expect(parseProfilePhotoUrl(`https://photos.example/${'a'.repeat(5000)}`)).toBeUndefined()
  })

  it('is the only file in src/ that calls executeJavaScript', () => {
    const callers = listFiles(SRC)
      .filter((file) => readFileSync(file, 'utf8').includes('executeJavaScript('))
      .map((file) => relative(SRC, file))
    expect(callers).toEqual([join('main', 'gmail-page.ts')])
  })
})
