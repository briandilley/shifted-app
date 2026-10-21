import { describe, expect, it } from 'vitest'
import { ASKED_PERMISSIONS } from '../../src/shared/api'
import { permissionCheck, permissionDecision } from '../../src/main/page-permissions'

const OTHER_PERMISSIONS = [
  'geolocation',
  'usb',
  'midi',
  'midiSysex',
  'hid',
  'serial',
  'fullscreen',
  'openExternal',
  'pointerLock',
  'clipboard-sanitized-write',
  'idle-detection',
  'window-management',
  'unknown',
  'not-a-permission'
]

describe('permissionDecision', () => {
  it('always allows notifications', () => {
    expect(permissionDecision('notifications', {})).toBe('allow')
    expect(permissionCheck('notifications', {})).toBe(true)
  })

  it('asks for the camera and microphone, screen sharing, and clipboard read the first time', () => {
    for (const permission of ['media', 'display-capture', 'clipboard-read']) {
      expect(permissionDecision(permission, {})).toBe('ask')
    }
    expect(ASKED_PERMISSIONS).toEqual(['media', 'display-capture', 'clipboard-read'])
  })

  it('uses the saved answer of the account after that', () => {
    const saved = { media: 'allow', 'display-capture': 'deny' } as const
    expect(permissionDecision('media', saved)).toBe('allow')
    expect(permissionDecision('display-capture', saved)).toBe('deny')
    expect(permissionDecision('clipboard-read', saved)).toBe('ask')
  })

  it('denies every other permission with no dialog, also with saved answers', () => {
    const saved = { media: 'allow', 'display-capture': 'allow', 'clipboard-read': 'allow' } as const
    for (const permission of OTHER_PERMISSIONS) {
      expect(permissionDecision(permission, {})).toBe('deny')
      expect(permissionDecision(permission, saved)).toBe('deny')
    }
  })
})

describe('permissionCheck', () => {
  it('grants an asked permission only with a saved "allow"', () => {
    expect(permissionCheck('media', {})).toBe(false)
    expect(permissionCheck('media', { media: 'deny' })).toBe(false)
    expect(permissionCheck('media', { media: 'allow' })).toBe(true)
    expect(permissionCheck('geolocation', { media: 'allow' })).toBe(false)
  })
})
