import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  applyImport,
  EMAIL_HELP,
  EMAIL_SUBJECT,
  emailLink,
  EXPORTED_ACCOUNT_KEYS,
  EXPORTED_GENERAL_KEYS,
  exportConfiguration,
  exportFileName,
  isEmptyImport,
  MAX_IMPORT_BYTES,
  NEWER_VERSION_MESSAGE,
  previewImport,
  readExportedConfiguration,
  TEXT_FORM_BEGIN,
  TEXT_FORM_END,
  toFileForm,
  toTextForm,
  UNREADABLE_MESSAGE,
  type ExportedConfiguration
} from '../../src/main/config-transfer'
import { emptyConfig, parseConfig, type AccountConfig, type Config } from '../../src/main/config'
import { parseMailto } from '../../src/main/mailto'

const NOW = new Date('2026-10-21T17:00:00.123Z')

function account(id: string, order: number, change: Partial<AccountConfig> = {}): AccountConfig {
  return {
    id,
    email: `user${order}@example.com`,
    nickname: '',
    color: '#1A73E8',
    order,
    lastGoogleApp: 'gmail',
    pagePermissions: {},
    unreadCountSource: 'automatic',
    automaticFeed: null,
    notifications: { 'new-mail': true, calendar: true, chat: true },
    quietHours: { enabled: false, start: '22:00', end: '07:00', days: [] },
    ...change
  }
}

/** A configuration with two accounts and General values that are not the defaults. */
function sampleConfig(): Config {
  return {
    ...emptyConfig(),
    general: { askWhereToSave: true, backgroundLoading: 'calendars-only', openAtLogin: true },
    accounts: [
      account('11111111-1111-4111-8111-111111111111', 0, {
        email: 'alice@example.com',
        nickname: 'Personal',
        color: '#D93025',
        lastGoogleApp: 'calendar',
        pagePermissions: { media: 'allow' },
        unreadCountSource: 'important',
        automaticFeed: 'primary',
        notifications: { 'new-mail': true, calendar: false, chat: true },
        quietHours: { enabled: true, start: '18:00', end: '09:00', days: [0, 6] }
      }),
      account('22222222-2222-4222-8222-222222222222', 1, {
        email: 'work@company.com',
        nickname: 'Work',
        color: '#188038'
      })
    ],
    snooze: { until: null },
    mailto: {
      defaultAccountId: '22222222-2222-4222-8222-222222222222',
      lastAccountId: '11111111-1111-4111-8111-111111111111'
    }
  }
}

/** The values that move to another computer, without the IDs. */
function movedValues(config: Config): unknown {
  return {
    general: config.general,
    accounts: [...config.accounts]
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        email: item.email,
        nickname: item.nickname,
        color: item.color,
        order: item.order,
        unreadCountSource: item.unreadCountSource,
        notifications: item.notifications,
        quietHours: item.quietHours
      }))
  }
}

/** Read a text that must be a valid exported configuration. */
function readValid(input: string | Uint8Array): ExportedConfiguration {
  const result = readExportedConfiguration(input)
  if (!result.ok) throw new Error(result.message)
  return result.configuration
}

describe('the export', () => {
  it('has the format, the version, the time, the accounts, and the General values', () => {
    const exported = exportConfiguration(sampleConfig(), NOW)
    expect(exported).toEqual({
      format: 'shifted-configuration',
      version: 1,
      exportedAt: '2026-10-21T17:00:00Z',
      accounts: [
        {
          email: 'alice@example.com',
          nickname: 'Personal',
          color: '#D93025',
          unreadCountSource: 'important',
          notifications: { 'new-mail': true, calendar: false, chat: true },
          quietHours: { enabled: true, start: '18:00', end: '09:00', days: [0, 6] }
        },
        {
          email: 'work@company.com',
          nickname: 'Work',
          color: '#188038',
          unreadCountSource: 'automatic',
          notifications: { 'new-mail': true, calendar: true, chat: true },
          quietHours: { enabled: false, start: '22:00', end: '07:00', days: [] }
        }
      ],
      general: { openAtLogin: true, backgroundLoading: 'calendars-only', askWhereToSave: true }
    })
  })

  it('has only the allowed keys, also when the configuration has more keys', () => {
    const config = sampleConfig()
    const withMore = {
      ...config,
      secret: 'top secret',
      general: { ...config.general, password: 'hunter2' },
      accounts: config.accounts.map((item) => ({
        ...item,
        cookies: 'SID=abc',
        session: { token: 'xyz' },
        notifications: { ...item.notifications, extra: true },
        quietHours: { ...item.quietHours, extra: 'value' }
      }))
    } as unknown as Config
    const exported = exportConfiguration(withMore, NOW)
    expect(Object.keys(exported).sort()).toEqual(
      ['accounts', 'exportedAt', 'format', 'general', 'version'].sort()
    )
    expect(Object.keys(exported.general).sort()).toEqual([...EXPORTED_GENERAL_KEYS].sort())
    for (const item of exported.accounts) {
      expect(Object.keys(item).sort()).toEqual([...EXPORTED_ACCOUNT_KEYS].sort())
      expect(Object.keys(item.notifications ?? {}).sort()).toEqual(['calendar', 'chat', 'new-mail'])
      expect(Object.keys(item.quietHours ?? {}).sort()).toEqual(['days', 'enabled', 'end', 'start'])
    }
    const text = toFileForm(exported)
    for (const word of ['secret', 'hunter2', 'SID=abc', 'xyz', 'extra', '1111', '2222']) {
      expect(text).not.toContain(word)
    }
    // No ID, no page permissions, no learned feed, no snooze, no account picker choices.
    for (const key of ['"id"', 'pagePermissions', 'automaticFeed', 'snooze', 'mailto']) {
      expect(text).not.toContain(key)
    }
  })

  it('writes the file form as JSON with an indent of 2 spaces', () => {
    const exported = exportConfiguration(sampleConfig(), NOW)
    const text = toFileForm(exported)
    expect(text).toBe(`${JSON.stringify(exported, null, 2)}\n`)
    expect(text.split('\n')[1]).toBe('  "format": "shifted-configuration",')
  })

  it('names the file after the local date', () => {
    expect(exportFileName(new Date(2026, 9, 21, 23, 59))).toBe(
      'Shifted configuration 2026-10-21.json'
    )
    expect(exportFileName(new Date(2026, 0, 5, 0, 1))).toBe('Shifted configuration 2026-01-05.json')
  })
})

describe('export, then import', () => {
  it('gives the same values, with new account IDs', () => {
    const config = sampleConfig()
    for (const form of [toFileForm, toTextForm]) {
      const imported = readValid(form(exportConfiguration(config, NOW)))
      const result = applyImport(emptyConfig(), imported)
      expect(movedValues(result)).toEqual(movedValues(config))
      const oldIds = config.accounts.map((item) => item.id)
      for (const item of result.accounts) {
        expect(oldIds).not.toContain(item.id)
        expect(item.id).toMatch(/^[0-9a-f-]{36}$/)
        expect(item.signInNeeded).toBe(true)
        expect(item.pagePermissions).toEqual({})
        expect(item.automaticFeed).toBeNull()
      }
      expect(new Set(result.accounts.map((item) => item.id)).size).toBe(2)
      // The result is a valid configuration file.
      expect(parseConfig(JSON.parse(JSON.stringify(result)))).toEqual(result)
    }
  })

  it('does not change the configuration that it gets', () => {
    const before = emptyConfig()
    applyImport(before, readValid(toFileForm(exportConfiguration(sampleConfig(), NOW))))
    expect(before).toEqual(emptyConfig())
  })

  it('changes an account with the same address and keeps its ID and its session', () => {
    const here: Config = {
      ...emptyConfig(),
      accounts: [
        account('33333333-3333-4333-8333-333333333333', 0, {
          email: 'Alice@Example.com',
          nickname: 'Old',
          pagePermissions: { media: 'deny' }
        }),
        account('44444444-4444-4444-8444-444444444444', 1, { email: 'stays@example.com' })
      ]
    }
    const imported = readValid(toFileForm(exportConfiguration(sampleConfig(), NOW)))
    const preview = previewImport(here, imported)
    expect(preview.addedAccounts).toEqual([
      { email: 'work@company.com', nickname: 'Work', color: '#188038' }
    ])
    expect(preview.changedAccounts).toHaveLength(1)
    expect(preview.changedAccounts[0]?.email).toBe('Alice@Example.com')
    expect(preview.changedAccounts[0]?.changes).toEqual([
      'Nickname: Personal (now Old)',
      'Color: Red (now Blue)',
      'Unread count source: Important (now Automatic)',
      'Calendar reminders notifications: off (now on)',
      'Quiet hours: 18:00 to 09:00, all day on Sat, Sun (now off)'
    ])
    expect(preview.generalChanges).toEqual([
      'Open at login: on (now off)',
      'Background loading: Calendars only (now Everything)',
      'Ask where to save each file: on (now off)'
    ])
    expect(preview.unchangedAccounts).toBe(1)

    const result = applyImport(here, imported)
    expect(result.accounts.map((item) => item.email)).toEqual([
      'Alice@Example.com',
      'stays@example.com',
      'work@company.com'
    ])
    const alice = result.accounts[0]
    expect(alice).toMatchObject({
      id: '33333333-3333-4333-8333-333333333333',
      nickname: 'Personal',
      color: '#D93025',
      pagePermissions: { media: 'deny' }
    })
    expect(alice?.signInNeeded).toBeUndefined()
    expect(result.accounts[1]).toEqual(here.accounts[1])
    expect(result.accounts[2]).toMatchObject({ order: 2, signInNeeded: true })

    // A second import of the same file changes nothing.
    expect(isEmptyImport(previewImport(result, imported))).toBe(true)
  })
})

describe('the text form', () => {
  const exported = exportConfiguration(sampleConfig(), NOW)

  it('is the compressed file form in base64 lines of 64 characters between two markers', () => {
    const text = toTextForm(exported)
    const lines = text.split('\n')
    expect(lines[0]).toBe(TEXT_FORM_BEGIN)
    expect(lines.at(-1)).toBe(TEXT_FORM_END)
    const body = lines.slice(1, -1)
    expect(body.slice(0, -1).every((line) => line.length === 64)).toBe(true)
    expect(body.every((line) => /^[A-Za-z0-9+/=]+$/.test(line))).toBe(true)
    const compressed = deflateRawSync(Buffer.from(toFileForm(exported), 'utf8'), { level: 9 })
    expect(body.join('')).toBe(compressed.toString('base64'))
  })

  it('survives extra line breaks and extra spaces', () => {
    const text = toTextForm(exported)
      .split('\n')
      .map((line) =>
        line.startsWith('-----')
          ? `  ${line} `
          : `  ${line.slice(0, 20)} \r\n\n ${line.slice(20)}\t `
      )
      .join('\r\n\r\n')
    expect(readValid(text)).toEqual(exported)
  })

  it('survives inside a whole email, with text before and after the markers', () => {
    const email = [
      'From: Alice <alice@example.com>',
      'To: alice@example.com',
      'Subject: Shifted configuration',
      '',
      EMAIL_HELP,
      '',
      toTextForm(exported),
      '',
      '--',
      'Sent from my phone. Text after the markers: {"format": "not-this"}'
    ].join('\n')
    expect(readValid(email)).toEqual(exported)
  })

  it('is less than 2,000 characters for 9 accounts with long nicknames and addresses', () => {
    const accounts = Array.from({ length: 9 }, (_, index) =>
      account(`5555555${index}-5555-4555-8555-555555555555`, index, {
        email: `firstname.lastname.department${index}@a-long-company-domain-name.com`,
        nickname: `Account number ${index + 1} for the marketing team`,
        color: ['#1A73E8', '#D93025', '#188038', '#F9AB00', '#A142F4'][index % 5] ?? '#1A73E8',
        quietHours: { enabled: index % 2 === 0, start: '18:00', end: '09:00', days: [0, 6] }
      })
    )
    const config: Config = { ...emptyConfig(), accounts }
    const text = toTextForm(exportConfiguration(config, NOW))
    expect(text.length).toBeLessThan(2000)
    // The plain JSON is several times longer.
    expect(toFileForm(exportConfiguration(config, NOW)).length).toBeGreaterThan(text.length * 2)
  })
})

describe('the import', () => {
  const config = sampleConfig()
  const exported = exportConfiguration(config, NOW)

  /** Read the text and check that the import refuses it with this message. */
  function expectRefused(input: string | Uint8Array, message = UNREADABLE_MESSAGE): void {
    const before = JSON.stringify(config)
    expect(readExportedConfiguration(input)).toEqual({ ok: false, message })
    // Nothing changes: the configuration on this computer stays the same.
    expect(JSON.stringify(config)).toBe(before)
  }

  /** The file form of the exported configuration, with one change. */
  function changed(change: (value: Record<string, unknown>) => void): string {
    const value = JSON.parse(toFileForm(exported)) as Record<string, unknown>
    change(value)
    return JSON.stringify(value)
  }

  function firstAccount(value: Record<string, unknown>): Record<string, unknown> {
    return (value['accounts'] as Record<string, unknown>[])[0] ?? {}
  }

  it('reads the file form as text and as bytes, also with a byte order mark', () => {
    const text = toFileForm(exported)
    expect(readValid(text)).toEqual(exported)
    expect(readValid(new TextEncoder().encode(`\uFEFF${text}`))).toEqual(exported)
  })

  it('refuses a wrong format', () => {
    expectRefused(changed((value) => (value['format'] = 'something-else')))
    expectRefused(changed((value) => delete value['format']))
    expectRefused('[]')
    expectRefused('"shifted-configuration"')
  })

  it('refuses broken JSON', () => {
    expectRefused(toFileForm(exported).slice(0, -20))
    expectRefused('')
    expectRefused(new Uint8Array([0xff, 0xfe, 0x00, 0x7b]))
  })

  it('refuses broken base64 and a text form with no end', () => {
    const text = toTextForm(exported)
    const lines = text.split('\n')
    expectRefused(text.replace(lines[2] ?? '', `${(lines[2] ?? '').slice(0, 30)}*#!`))
    expectRefused(text.replace(lines[1] ?? '', (lines[1] ?? '').slice(1)))
    expectRefused(`${TEXT_FORM_BEGIN}\nAAAA\n${TEXT_FORM_END}`)
    expectRefused(`${TEXT_FORM_BEGIN}\n${TEXT_FORM_END}`)
    expectRefused(text.replace(TEXT_FORM_END, ''))
    // Valid base64 of something that is not compressed JSON.
    expectRefused(
      `${TEXT_FORM_BEGIN}\n${deflateRawSync(Buffer.from('not json')).toString('base64')}\n${TEXT_FORM_END}`
    )
  })

  it('refuses a newer version with its own message', () => {
    expectRefused(
      changed((value) => (value['version'] = 2)),
      NEWER_VERSION_MESSAGE
    )
    expectRefused(changed((value) => (value['version'] = 0)))
    expectRefused(changed((value) => (value['version'] = '1')))
    expectRefused(changed((value) => (value['version'] = 1.5)))
  })

  it('refuses more than 256 KB from a file or the text box', () => {
    const padding = ' '.repeat(MAX_IMPORT_BYTES)
    const large = `${toFileForm(exported)}${padding}`
    expectRefused(large)
    expectRefused(new TextEncoder().encode(large))
    // Exactly 256 KB is still read.
    const text = toFileForm(exported)
    const exact = `${text}${' '.repeat(MAX_IMPORT_BYTES - Buffer.byteLength(text))}`
    expect(readValid(exact)).toEqual(exported)
    // A small text form that unpacks to more than 256 KB.
    const bomb = deflateRawSync(Buffer.from(`${text}${padding}`)).toString('base64')
    expect(bomb.length).toBeLessThan(MAX_IMPORT_BYTES)
    expectRefused(`${TEXT_FORM_BEGIN}\n${bomb}\n${TEXT_FORM_END}`)
  })

  it('refuses a known key with a wrong type or a value out of range', () => {
    const wrong: ((value: Record<string, unknown>) => void)[] = [
      (value) => (value['accounts'] = {}),
      (value) => (value['general'] = []),
      (value) => (value['exportedAt'] = 5),
      (value) => ((value['general'] as Record<string, unknown>)['backgroundLoading'] = 'all'),
      (value) => ((value['general'] as Record<string, unknown>)['openAtLogin'] = 'yes'),
      (value) => ((value['accounts'] as unknown[])[0] = 'alice@example.com'),
      (value) => (firstAccount(value)['email'] = 'not an address'),
      (value) => (firstAccount(value)['email'] = 42),
      (value) => (firstAccount(value)['nickname'] = 'x'.repeat(101)),
      (value) => (firstAccount(value)['color'] = 'red'),
      (value) => (firstAccount(value)['unreadCountSource'] = 'spam'),
      (value) => (firstAccount(value)['notifications'] = { calendar: 'off' }),
      (value) =>
        (firstAccount(value)['quietHours'] = {
          enabled: true,
          start: '25:00',
          end: '07:00',
          days: []
        }),
      (value) =>
        (firstAccount(value)['quietHours'] = {
          enabled: true,
          start: '22:00',
          end: '07:00',
          days: [7]
        }),
      // Two accounts with the same address.
      (value) => {
        const accounts = value['accounts'] as Record<string, unknown>[]
        const second = accounts[1]
        if (second) second['email'] = 'ALICE@example.com'
      }
    ]
    for (const change of wrong) expectRefused(changed(change))
  })

  it('ignores keys that it does not know, and uses defaults for missing values', () => {
    const text = changed((value) => {
      value['future'] = { anything: true }
      ;(value['general'] as Record<string, unknown>)['newSwitch'] = 'on'
      const first = firstAccount(value)
      first['id'] = '11111111-1111-4111-8111-111111111111'
      first['pagePermissions'] = { media: 'allow' }
      first['photo'] = 'data:image/png;base64,AAAA'
      ;(first['notifications'] as Record<string, unknown>)['sms'] = 'maybe'
      const second = (value['accounts'] as Record<string, unknown>[])[1] ?? {}
      delete second['color']
      delete second['notifications']
      delete value['general']
    })
    const imported = readValid(text)
    expect(imported.accounts[0]).toEqual(exported.accounts[0])
    expect(imported.general).toEqual({})
    const result = applyImport(emptyConfig(), imported)
    expect(result.general).toEqual(emptyConfig().general)
    expect(result.accounts[0]?.id).not.toBe('11111111-1111-4111-8111-111111111111')
    expect(result.accounts[0]?.pagePermissions).toEqual({})
    // A missing color gets the next free color (Red is taken), and missing switches are on.
    expect(result.accounts[1]?.color).toBe('#188038')
    expect(result.accounts[1]?.notifications).toEqual({
      'new-mail': true,
      calendar: true,
      chat: true
    })
  })
})

describe('Email it to myself', () => {
  it('makes a mailto: link to the address with the subject and the text form', () => {
    const text = toTextForm(exportConfiguration(sampleConfig(), NOW))
    const link = emailLink('alice+shifted@example.com', text)
    expect(link.startsWith('mailto:alice%2Bshifted@example.com?')).toBe(true)
    const fields = parseMailto(link)
    expect(fields?.to).toEqual(['alice+shifted@example.com'])
    expect(fields?.subject).toBe(EMAIL_SUBJECT)
    expect(fields?.body).toBe(`${EMAIL_HELP}\r\n\r\n${text.replace(/\n/g, '\r\n')}\r\n`)
    // The import reads the whole body of the message.
    expect(readValid(fields?.body ?? '')).toEqual(exportConfiguration(sampleConfig(), NOW))
  })
})
