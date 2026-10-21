# Electron and TypeScript

Shifted is an Electron app written in TypeScript. It runs on macOS, Windows, and Linux from one code base.

We chose Electron because it bundles Chromium, the engine of Google Chrome. Google's sign-in pages see the same engine on every operating system, which gives the lowest risk that Google blocks the sign-in. Electron also has the parts that Shifted needs: a persistent session for each account, more than one web view in a window, app badges, notifications, and a handler for `mailto:` links. The cost is memory: each account that is loaded runs its own Chromium process.

## Considered Options

- Tauri 2. It uses the web view of each operating system, so it is much smaller. Rejected for three reasons. More than one web view in a window is still an unstable feature. The storage for each account works differently on each operating system. Google sign-in in WebKit web views is a known risk.
- Qt WebEngine. It is real Chromium with one profile for each account. Rejected because fewer coding agents write good Qt code, and packaging for three operating systems is harder.
- A native app for each operating system. Rejected because it triples the work.
