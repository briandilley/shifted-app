import { describe, expect, it } from 'vitest'
import {
  chooseMailtoAction,
  findMailtoArgument,
  isMailtoUrl,
  mailtoHeading,
  parseMailto
} from '../../src/main/mailto'

describe('parseMailto', () => {
  it('reads one address', () => {
    expect(parseMailto('mailto:bob@example.com')).toEqual({
      to: ['bob@example.com'],
      cc: [],
      bcc: [],
      subject: '',
      body: ''
    })
  })

  it('reads several addresses, and addresses from the to field', () => {
    expect(parseMailto('mailto:a@example.com,b@example.com?to=c@example.com')?.to).toEqual([
      'a@example.com',
      'b@example.com',
      'c@example.com'
    ])
    expect(parseMailto('mailto:a@example.com%2C%20b@example.com')?.to).toEqual([
      'a@example.com',
      'b@example.com'
    ])
    expect(parseMailto('mailto:?to=a@example.com&to=b@example.com')?.to).toEqual([
      'a@example.com',
      'b@example.com'
    ])
  })

  it('reads cc, bcc, subject, and body', () => {
    expect(
      parseMailto(
        'mailto:bob@example.com?cc=carol@example.com,dan@example.com&bcc=eve@example.com&subject=Hello&body=Hi%20Bob'
      )
    ).toEqual({
      to: ['bob@example.com'],
      cc: ['carol@example.com', 'dan@example.com'],
      bcc: ['eve@example.com'],
      subject: 'Hello',
      body: 'Hi Bob'
    })
  })

  it('reads encoded characters', () => {
    const fields = parseMailto(
      'mailto:%22not%40me%22@example.org?subject=Caf%C3%A9%20%26%20more&body=line%201%0D%0Aline%202%3F'
    )
    expect(fields?.to).toEqual(['"not@me"@example.org'])
    expect(fields?.subject).toBe('Café & more')
    expect(fields?.body).toBe('line 1\r\nline 2?')
  })

  it('keeps + as +, and keeps text with a broken percent code', () => {
    expect(parseMailto('mailto:a+tag@example.com?subject=1+1')).toMatchObject({
      to: ['a+tag@example.com'],
      subject: '1+1'
    })
    expect(parseMailto('mailto:a@example.com?subject=100%')?.subject).toBe('100%')
  })

  it('reads field names in any case, takes the first subject, and ignores other fields', () => {
    expect(
      parseMailto('MAILTO:a@example.com?SUBJECT=First&Subject=Second&CC=b@example.com&x-foo=bar')
    ).toEqual({ to: ['a@example.com'], cc: ['b@example.com'], bcc: [], subject: 'First', body: '' })
  })

  it('reads a link with no address', () => {
    expect(parseMailto('mailto:')).toEqual({ to: [], cc: [], bcc: [], subject: '', body: '' })
    expect(parseMailto('mailto:?subject=Hi')?.subject).toBe('Hi')
  })

  it('refuses text that is not a mailto: link', () => {
    expect(parseMailto('https://example.com/')).toBeUndefined()
    expect(parseMailto('bob@example.com')).toBeUndefined()
    expect(isMailtoUrl('Mailto:bob@example.com')).toBe(true)
    expect(isMailtoUrl('webcal:example.com')).toBe(false)
  })
})

describe('mailtoHeading', () => {
  it('names the addresses of the link', () => {
    expect(mailtoHeading('mailto:bob@example.com?subject=Hello')).toBe(
      'New message to bob@example.com'
    )
    expect(mailtoHeading('mailto:a@example.com,b@example.com')).toBe(
      'New message to a@example.com, b@example.com'
    )
    expect(mailtoHeading('mailto:?subject=Hello')).toBe('New message')
  })
})

describe('findMailtoArgument', () => {
  it('finds the link on a command line', () => {
    expect(findMailtoArgument(['/path/Shifted', 'mailto:bob@example.com'])).toBe(
      'mailto:bob@example.com'
    )
    expect(
      findMailtoArgument([
        'electron',
        '/app',
        '--flag',
        'mailto:a@example.com',
        'mailto:b@example.com'
      ])
    ).toBe('mailto:b@example.com')
    expect(findMailtoArgument(['/path/Shifted', '--hidden'])).toBeUndefined()
  })
})

describe('chooseMailtoAction', () => {
  const A = '0b6f0a5e-3f0c-4a51-9d3b-6f1f6c1c2a10'
  const B = '5d1c9a0e-8f53-4b0a-a4a2-0e8a6f8b9c11'
  const GONE = '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

  it('says "no accounts" when Shifted has no accounts', () => {
    expect(chooseMailtoAction([], null, null)).toEqual({ kind: 'no-accounts' })
    expect(chooseMailtoAction([], A, A)).toEqual({ kind: 'no-accounts' })
  })

  it('skips the picker when a mailto: default exists', () => {
    expect(chooseMailtoAction([A, B], B, A)).toEqual({ kind: 'account', accountId: B })
    expect(chooseMailtoAction([A], A, null)).toEqual({ kind: 'account', accountId: A })
  })

  it('shows the picker with the account used last selected', () => {
    expect(chooseMailtoAction([A, B], null, B)).toEqual({ kind: 'picker', selectedAccountId: B })
  })

  it('shows the picker with the first account selected when no account was used yet', () => {
    expect(chooseMailtoAction([A, B], null, null)).toEqual({
      kind: 'picker',
      selectedAccountId: A
    })
    // One account and no default still shows the picker.
    expect(chooseMailtoAction([B], null, null)).toEqual({ kind: 'picker', selectedAccountId: B })
  })

  it('ignores a default or a last account that is not there any more', () => {
    expect(chooseMailtoAction([A, B], GONE, GONE)).toEqual({
      kind: 'picker',
      selectedAccountId: A
    })
  })
})
