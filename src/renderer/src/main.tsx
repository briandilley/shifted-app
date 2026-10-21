import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SETTINGS_SCREEN_HASH, SIGN_IN_SCREEN_HASH } from '../../shared/api'
import App from './App'
import SettingsScreen from './SettingsScreen'
import SignInScreen from './SignInScreen'

const root = document.getElementById('root')
if (!root) throw new Error('The page has no #root element.')

// The URL hash tells which screen of Shifted this page shows.
const hash = window.location.hash.replace(/^#/, '')
const isSignInScreen = hash === SIGN_IN_SCREEN_HASH
const isSettingsScreen =
  hash === SETTINGS_SCREEN_HASH || hash.startsWith(`${SETTINGS_SCREEN_HASH}/`)

createRoot(root).render(
  <StrictMode>
    {isSignInScreen ? <SignInScreen /> : isSettingsScreen ? <SettingsScreen /> : <App />}
  </StrictMode>
)
