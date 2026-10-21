import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SIGN_IN_SCREEN_HASH } from '../../shared/api'
import App from './App'
import SignInScreen from './SignInScreen'

const root = document.getElementById('root')
if (!root) throw new Error('The page has no #root element.')

const isSignInScreen = window.location.hash === `#${SIGN_IN_SCREEN_HASH}`

createRoot(root).render(<StrictMode>{isSignInScreen ? <SignInScreen /> : <App />}</StrictMode>)
