import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The production page has a strict Content Security Policy. In development only, Vite
 * injects styles with `<style>` tags and uses a WebSocket for hot reload, so the
 * development server relaxes the policy for those two things.
 */
function devContentSecurityPolicy(): Plugin {
  return {
    name: 'shifted-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*")
    }
  }
}

export default defineConfig({
  main: {},
  preload: {
    build: {
      rolldownOptions: {
        // Two preload scripts: one for the screens of Shifted, one for the Google pages.
        // Each one runs in a sandbox, so each must be one file. They share no module.
        input: {
          index: resolve('src/preload/index.ts'),
          'google-page': resolve('src/preload/google-page.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), devContentSecurityPolicy()]
  }
})
