import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  MAILTO_PICKER_HASH,
  SCREEN_PICKER_HASH,
  SETTINGS_SCREEN_HASH,
  SIGN_IN_SCREEN_HASH
} from '../../shared/api'
import App from './App'
import MailtoPickerScreen from './MailtoPickerScreen'
import ScreenPickerScreen from './ScreenPickerScreen'
import SettingsScreen from './SettingsScreen'
import SignInScreen from './SignInScreen'

const root = document.getElementById('root')
if (!root) throw new Error('The page has no #root element.')

// The URL hash tells which screen of Shifted this page shows.
const hash = window.location.hash.replace(/^#/, '')
const isSignInScreen = hash === SIGN_IN_SCREEN_HASH
const isSettingsScreen =
  hash === SETTINGS_SCREEN_HASH || hash.startsWith(`${SETTINGS_SCREEN_HASH}/`)

const isScreenPicker = hash === SCREEN_PICKER_HASH
const isMailtoPicker = hash === MAILTO_PICKER_HASH

const screen = isSignInScreen ? (
  <SignInScreen />
) : isSettingsScreen ? (
  <SettingsScreen />
) : isScreenPicker ? (
  <ScreenPickerScreen />
) : isMailtoPicker ? (
  <MailtoPickerScreen />
) : (
  <App />
)

createRoot(root).render(<StrictMode>{screen}</StrictMode>)
