import { describe, expect, it } from 'vitest'
import {
  accountSettingsPage,
  parseSettingsRequest,
  settingsHash,
  settingsPageAccountId
} from '../../src/shared/api'

const ID = '0b6f0a5e-3f0c-4a51-9d3b-6f1f6c1c2a10'

describe('the pages of the configuration window', () => {
  it('makes a URL hash and reads it again', () => {
    expect(settingsHash({ page: 'general' })).toBe('settings/general')
    expect(settingsHash({ page: accountSettingsPage(ID), focus: 'nickname' })).toBe(
      `settings/account/${ID}/nickname`
    )
    for (const request of [
      { page: 'general' as const },
      { page: 'notifications' as const },
      { page: accountSettingsPage(ID) },
      { page: accountSettingsPage(ID), focus: 'color' as const }
    ]) {
      expect(parseSettingsRequest(`#${settingsHash(request)}`)).toEqual(request)
    }
  })

  it('shows General for the hash "settings" alone', () => {
    expect(parseSettingsRequest('#settings')).toEqual({ page: 'general' })
  })

  it('refuses a request that is not valid', () => {
    expect(parseSettingsRequest('#sign-in')).toBeUndefined()
    expect(parseSettingsRequest('#settings/drive')).toBeUndefined()
    expect(parseSettingsRequest('#settings/account/../../etc')).toBeUndefined()
    expect(parseSettingsRequest({ page: 'general', focus: 'password' })).toBeUndefined()
    expect(parseSettingsRequest({ page: 3 })).toBeUndefined()
    expect(parseSettingsRequest(null)).toBeUndefined()
  })

  it('finds the account of an account page', () => {
    expect(settingsPageAccountId(accountSettingsPage(ID))).toBe(ID)
    expect(settingsPageAccountId('general')).toBeUndefined()
  })
})
