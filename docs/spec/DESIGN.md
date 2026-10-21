# Shifted: visual design

This file tells the build agent how the screens of Shifted look. The design is called "Card stack". The words in this file have the meanings in `GLOSSARY.md`.

## The idea

- Google's pages fill most of the window. Shifted only frames them.
- The content area looks like a rounded card that floats on the backdrop. The backdrop has a tint of the color of the selected account. So the whole window shows which account you are in.
- The selected account in the sidebar sits on a selection tile. The tile joins the content area, like a card that you pull from a stack. This repeats the idea of the app icon.
- The Gmail and Calendar tabs are folder tabs on the top edge of the content area.

```
+------------------------------------------------+
| o o o   [ Gmail ]  Calendar      * alex@co.com |  <- backdrop, tinted
|  (A)  +----------------------------------------+
| [(B)==|                                        |  <- selection tile joins
|  (C)  |        Gmail of account B              |     the content area
|  (+)  |        (Google's own page)             |
|       +----------------------------------------+
+------------------------------------------------+
```

## Light and dark mode

- Shifted follows the light or dark mode of the operating system. Keep `nativeTheme.themeSource` at `system`. The screens of Shifted use the CSS media query `prefers-color-scheme`.
- A change of the mode applies at once, with no restart.
- Shifted does not restyle Google's pages. Gmail and Calendar keep the theme that the person picked in Google. Google's pages also see the mode of the operating system through `prefers-color-scheme`.

## Color tokens

Put these tokens in one CSS file as custom properties, with a light set and a dark set.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--base` | `#E9EDF3` | `#12151C` | The backdrop with no account tint. |
| `--surface` | `#FFFFFF` | `#1F1F1F` | The content area, the selection tile, the active folder tab, and cards in other windows. |
| `--text` | `#1A1F2B` | `#E6E9F0` | Main text. |
| `--text-secondary` | `#525A6A` | `#9098A8` | Secondary text and inactive tabs. |
| `--separator` | `rgba(20,30,50,.08)` | `rgba(255,255,255,.08)` | Lines between rows. |
| `--field` | `rgba(20,30,50,.06)` | `rgba(255,255,255,.07)` | Field and secondary button fill. |
| `--accent` | `#2F5BE0` | `#6D8CFF` | Toggles that are on, focus rings, and links. |
| `--toggle-off` | `rgba(20,30,50,.16)` | `rgba(255,255,255,.18)` | Toggles that are off. |
| `--badge` | `#1F2430` | `#E9ECF2` | Unread badge fill. |
| `--badge-text` | `#FFFFFF` | `#12151C` | Unread badge number. |
| `--warning` | `#D13438` | `#D13438` | Warning badge fill. The mark is white. |
| `--surface-shadow` | `0 1px 2px rgba(15,23,42,.08), 0 10px 30px rgba(15,23,42,.10)` | `0 0 0 1px rgba(255,255,255,.06), 0 12px 34px rgba(0,0,0,.5)` | The shadow under the content area and under cards. |

## Account colors and backdrops

Each account has one of these 8 colors. A new account gets the next color in the list. The backdrop of the window is the base color mixed with the account color in OKLab: 13% in light mode and 14% in dark mode. Use the values in this table. Do not mix colors at run time.

| Name | Account color | Light backdrop | Dark backdrop |
| --- | --- | --- | --- |
| Blue | `#1A73E8` | `#D0DEF3` | `#162134` |
| Red | `#D93025` | `#ECD7D9` | `#2C1D20` |
| Green | `#188038` | `#D0DFDA` | `#162321` |
| Yellow | `#F9AB00` | `#ECE5DD` | `#2D2823` |
| Purple | `#A142F4` | `#DFD9F5` | `#231D36` |
| Cyan | `#12B5CB` | `#D4E6EE` | `#192831` |
| Orange | `#E8710A` | `#EBDEDA` | `#2C2221` |
| Gray | `#5F6368` | `#D6DAE0` | `#1C1F26` |

With no account, the backdrop is `--base`.

## Type

- Use the system font of each operating system: `system-ui, -apple-system, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", Cantarell, Ubuntu, sans-serif`. Do not bundle font files.
- Main text: 13 px, line height 1.35.
- Secondary text: 11.5 px.
- Folder tabs: 12.5 px, weight 550.
- Page titles in the configuration window: 20 px, weight 650.
- Badges: 11 px, weight 600.
- Use sentence case everywhere. Do not use all-caps labels.

## The main window

All sizes are in points.

- Minimum window size: 900 by 600.
- The sidebar is 76 wide. It has no fill, so the backdrop shows through.
- The top row is 40 high. It is the drag region of the window. The tabs and buttons in it are not.
- The content area starts at x 76 and y 40. It ends 10 from the right edge and 10 from the bottom edge. All four corners have a radius of 12.
- Each account has a slot 52 high, with 10 between slots. The avatar is 38 across, with a 2-point ring in the account color.

### Selection tile

- The selection tile is in the `--surface` color. It goes from x 12 to the left edge of the content area, and it is 52 high.
- Its left corners have a radius of 14. Its right side has no corners, because it joins the content area.
- Above and below its right end, add two inverse corners with a radius of 14. They make the tile flow into the content area.
- When the selected account changes, the tile slides to the new slot in 200 ms, with ease-out.

### Folder tabs

- The folder tabs start 14 from the left edge of the content area. They sit on its top edge.
- Each tab has a padding of 8 at the top, 18 at the sides, and 9 at the bottom. Its top corners have a radius of 10.
- The active tab has the `--surface` fill and the `--text` color, so it joins the content area.
- An inactive tab has no fill and the `--text-secondary` color.
- The right end of the top row shows the address of the selected account in `--text`. A dot of 8 in the account color comes before it.

### Badges and buttons

- An unread badge is a pill, 18 high, at least 18 wide, with a radius of 9. It sits on the top-right corner of the avatar slot.
- A number above 99 shows as "99+". A warning badge shows a white "!" on `--warning`.
- The add-account button is a circle, 38 across, with a dashed 1.5-point border and a "+" in `--text-secondary`.

## How to build it in Electron

- One React view, the frame view, fills the whole window. It draws the backdrop, the sidebar, the top row, the selection tile, and the shadow of the content area.
- The Google web view lies on top of the rectangle of the content area. Call `view.setBorderRadius(12)` on it.
- The frame view also draws the panels that replace a Google page, for example "Signing in…", the signed-out panel, and the crash panel. Show such a panel by hiding the Google web view.
- Set the background color of the window to the backdrop color, so that no white flash shows at startup.
- When the selected account changes, change the backdrop color with a 200 ms ease-out transition.

### Window frame on each platform

- macOS: `titleBarStyle: 'hiddenInset'` and `trafficLightPosition: { x: 14, y: 13 }`. The traffic lights sit on the backdrop above the sidebar.
- Windows and Linux: `titleBarStyle: 'hidden'` and `titleBarOverlay: { color: <backdrop>, symbolColor: <--text>, height: 40 }`. After each change of the backdrop or the mode, call `setTitleBarOverlay`. Keep the right end of the top row clear of the window buttons. Use the CSS environment values `titlebar-area-x` and `titlebar-area-width`.

## The other windows

- Configuration window: the list of pages is on the backdrop. The open page is a card in `--surface`, with a radius of 12 and a margin of 10. The selected list item has the `--surface` fill. The backdrop is `--base` on the General and Notifications pages. On the page of an account, it has the tint of that account.
- Account picker: one card in `--surface` on the backdrop. The fill of the selected row is 14% of the account color over `--surface`. Its inside border is 1.5 points of the account color at 55%.
- Sign-in window: the line of help is on the backdrop at the top, in `--text-secondary`, 12 px. Google's page is below it, in a web view with a radius of 12 and a margin of 10.

## Controls

- Toggle: 34 by 20, with a knob of 16. Off is `--toggle-off`. On is `--accent`. The knob moves in 150 ms.
- Primary button: `--text` fill with `--surface` text, radius 7, 12.5 px, weight 550.
- Secondary button: `--field` fill with `--text` text.
- Select: `--surface` fill with a 1-point inside border in `--separator`, radius 7.
- Focus: every control that can get focus shows a 2-point `--accent` outline, 2 points outside the control.
- Icons: Lucide icons, 16 px, stroke 1.75. Bundle the icons with the app.

## Motion

- Only three things move: the backdrop color, the selection tile, and the toggle knobs.
- If the operating system asks for reduced motion, nothing moves. Changes apply at once.

## Contrast

- All text has a contrast of at least 4.5 to 1 against its background, in both modes. This includes `--text-secondary` on all 16 backdrops in the table.
- The values in this file meet that rule. Prompt 09 tests it.
