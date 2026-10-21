import { describe, expect, it } from 'vitest'
import { desktopExecArgument, linuxAutostartEntry } from '../../src/main/login-item'
import { isOnScreen, parseWindowState, restoredBounds } from '../../src/main/window-state'

const PRIMARY = { x: 0, y: 25, width: 1440, height: 875 }
const SECOND = { x: 1440, y: 0, width: 1920, height: 1080 }
const SIZE = { width: 1200, height: 800, minWidth: 900, minHeight: 600 }

describe('the position of the main window', () => {
  it('puts the window back where it was', () => {
    const saved = { x: 1600, y: 100, width: 1000, height: 700 }
    expect(restoredBounds(saved, [PRIMARY, SECOND], PRIMARY, SIZE)).toEqual(saved)
  })

  it('centers the window on the main screen when it is off every screen', () => {
    // The second screen is gone.
    const saved = { x: 1600, y: 100, width: 1000, height: 700 }
    expect(restoredBounds(saved, [PRIMARY], PRIMARY, SIZE)).toEqual({
      x: 220,
      y: 113,
      width: 1000,
      height: 700
    })
  })

  it('centers a new window, and makes a saved window no larger than the main screen', () => {
    expect(restoredBounds(undefined, [PRIMARY], PRIMARY, SIZE)).toEqual({
      x: 120,
      y: 63,
      width: 1200,
      height: 800
    })
    const huge = { x: -5000, y: 0, width: 3000, height: 2000 }
    expect(restoredBounds(huge, [PRIMARY], PRIMARY, SIZE)).toMatchObject({
      x: 0,
      width: 1440,
      height: 875
    })
  })

  it('needs a part of at least 100 by 40 points on a screen', () => {
    expect(isOnScreen({ x: 1350, y: 100, width: 800, height: 600 }, [PRIMARY])).toBe(false)
    expect(isOnScreen({ x: 1340, y: 100, width: 800, height: 600 }, [PRIMARY])).toBe(true)
    expect(isOnScreen({ x: 100, y: 870, width: 800, height: 600 }, [PRIMARY])).toBe(false)
  })

  it('reads a saved state and refuses a broken one', () => {
    expect(
      parseWindowState({ bounds: { x: 1, y: 2, width: 3, height: 4 }, maximized: true })
    ).toEqual({ bounds: { x: 1, y: 2, width: 3, height: 4 }, maximized: true })
    expect(parseWindowState({ bounds: { x: 1, y: 2, width: 3 } })).toBeUndefined()
    expect(parseWindowState({ bounds: { x: 1, y: 2, width: 0, height: 4 } })).toBeUndefined()
    expect(parseWindowState(null)).toBeUndefined()
  })
})

describe('the autostart desktop file on Linux', () => {
  it('quotes the arguments of Exec', () => {
    expect(desktopExecArgument('/opt/Shifted/shifted')).toBe('/opt/Shifted/shifted')
    expect(desktopExecArgument('/home/a b/Shifted.AppImage')).toBe('"/home/a b/Shifted.AppImage"')
    expect(desktopExecArgument('/tmp/$x"y')).toBe('"/tmp/\\$x\\"y"')
  })

  it('runs Shifted with --opened-at-login', () => {
    const entry = linuxAutostartEntry(['/home/a b/Shifted.AppImage', '--opened-at-login'])
    expect(entry).toContain('[Desktop Entry]\nType=Application\nName=Shifted\n')
    expect(entry).toContain('Exec="/home/a b/Shifted.AppImage" --opened-at-login\n')
  })
})
