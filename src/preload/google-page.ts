/**
 * The preload script of the Gmail and Calendar views and of the child windows. It runs in
 * every frame of these pages.
 *
 * Gmail and Calendar make web notifications with `new Notification(...)`, and a page can
 * also use `ServiceWorkerRegistration.showNotification(...)`. This script puts a small
 * replacement for both into the main world of the page, before the page runs. The
 * replacement sends the title, body, tag, and icon to the main process, which applies the
 * switches, snooze, and quiet hours of Shifted and shows the notification. When you click
 * the notification, the main process sends the click back, and the replacement calls the
 * `onclick` of the page.
 *
 * The page gets only three functions: show, close, and listen. It gets no access to
 * Node.js, to the file system, or to other IPC channels.
 */
import { contextBridge, ipcRenderer } from 'electron'
import {
  PageNotificationChannel,
  type PageNotificationEvent,
  type PageNotificationSource
} from '../shared/page-notifications'
import { TEST_CRASH_CHANNEL, TEST_HOOKS_ARGUMENT } from '../shared/test-hooks'

type EventListener = (id: number, type: PageNotificationEvent) => void

/** What the replacement in the main world can call. */
interface NotificationBridge {
  /** Send one notification to the main process. Returns its id. */
  show(details: unknown): number
  /** Close one notification. */
  close(id: unknown): void
  /** Set the function that gets the events of the notifications. */
  listen(listener: EventListener): void
}

let listener: EventListener | null = null
let nextId = 0

function field(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

const bridge: NotificationBridge = {
  show(details) {
    const record =
      typeof details === 'object' && details !== null ? (details as Record<string, unknown>) : {}
    const id = nextId++
    const source: PageNotificationSource =
      record['source'] === 'service-worker' ? 'service-worker' : 'notification'
    ipcRenderer.send(PageNotificationChannel.show, {
      id,
      title: field(record, 'title'),
      body: field(record, 'body'),
      tag: field(record, 'tag'),
      icon: field(record, 'icon'),
      source
    })
    return id
  },
  close(id) {
    if (typeof id === 'number') ipcRenderer.send(PageNotificationChannel.close, id)
  },
  listen(next) {
    listener = next
  }
}

ipcRenderer.on(PageNotificationChannel.event, (_event, id: unknown, type: unknown) => {
  if (typeof id !== 'number' || (type !== 'click' && type !== 'close')) return
  listener?.(id, type)
})

/**
 * The replacement. It runs in the main world of the page, so it must not use anything
 * from outside the function: Electron copies only its source text.
 */
function installReplacement(shifted: NotificationBridge): void {
  const instances = new Map<number, EventTarget>()
  const ids = new WeakMap<EventTarget, number>()

  const text = (value: unknown): string =>
    value === undefined || value === null ? '' : String(value)
  const url = (value: unknown): string => {
    if (!value) return ''
    try {
      return new URL(String(value), location.href).href
    } catch {
      return ''
    }
  }
  const fire = (target: EventTarget, type: string): void => {
    const event = new Event(type)
    target.dispatchEvent(event)
    const handler = (target as unknown as Record<string, unknown>)[`on${type}`]
    if (typeof handler === 'function') {
      try {
        handler.call(target, event)
      } catch (error) {
        setTimeout(() => {
          throw error
        })
      }
    }
  }

  class Notification extends EventTarget {
    constructor(title: unknown, options?: Record<string, unknown>) {
      super()
      if (arguments.length === 0) {
        throw new TypeError(
          "Failed to construct 'Notification': 1 argument required, but only 0 present."
        )
      }
      const o = options ?? {}
      const values: Record<string, unknown> = {
        title: text(title),
        body: text(o['body']),
        tag: text(o['tag']),
        icon: url(o['icon']),
        badge: url(o['badge']),
        image: url(o['image']),
        dir: text(o['dir']) || 'auto',
        lang: text(o['lang']),
        data: o['data'] === undefined ? null : o['data'],
        silent: o['silent'] === undefined ? null : Boolean(o['silent']),
        requireInteraction: Boolean(o['requireInteraction']),
        renotify: Boolean(o['renotify']),
        timestamp: typeof o['timestamp'] === 'number' ? o['timestamp'] : Date.now(),
        actions: [],
        vibrate: []
      }
      for (const [key, value] of Object.entries(values)) {
        Object.defineProperty(this, key, { value, enumerable: true })
      }
      const self = this as unknown as Record<string, unknown>
      self['onclick'] = null
      self['onshow'] = null
      self['onclose'] = null
      self['onerror'] = null
      const id = shifted.show({
        title: values['title'],
        body: values['body'],
        tag: values['tag'],
        icon: values['icon'],
        source: 'notification'
      })
      ids.set(this, id)
      instances.set(id, this)
      setTimeout(() => fire(this, 'show'))
    }

    close(): void {
      const id = ids.get(this)
      if (id === undefined || !instances.has(id)) return
      instances.delete(id)
      shifted.close(id)
      fire(this, 'close')
    }

    static get permission(): string {
      return 'granted'
    }

    static get maxActions(): number {
      return 0
    }

    static requestPermission(callback?: unknown): Promise<string> {
      if (typeof callback === 'function')
        setTimeout(() => (callback as (v: string) => void)('granted'))
      return Promise.resolve('granted')
    }
  }

  shifted.listen((id, type) => {
    const notification = instances.get(id)
    if (!notification) return
    if (type === 'close') instances.delete(id)
    fire(notification, type)
  })

  Object.defineProperty(window, 'Notification', {
    value: Notification,
    writable: true,
    configurable: true,
    enumerable: false
  })

  // A notification of a service worker registration has no `onclick` in the page. Its
  // click only selects the account and the tab.
  if (typeof ServiceWorkerRegistration === 'function') {
    const prototype = ServiceWorkerRegistration.prototype
    Object.defineProperty(prototype, 'showNotification', {
      value: function showNotification(title: unknown, options?: Record<string, unknown>) {
        const o = options ?? {}
        shifted.show({
          title: text(title),
          body: text(o['body']),
          tag: text(o['tag']),
          icon: url(o['icon']),
          source: 'service-worker'
        })
        return Promise.resolve()
      },
      writable: true,
      configurable: true
    })
    Object.defineProperty(prototype, 'getNotifications', {
      value: function getNotifications() {
        return Promise.resolve([])
      },
      writable: true,
      configurable: true
    })
  }
}

contextBridge.executeInMainWorld({ func: installReplacement, args: [bridge] })

// Test hook: in test mode only, the main process can make this page crash, so that an
// end-to-end test sees the panel "This page stopped.". The page itself never sees it.
if (process.argv.includes(TEST_HOOKS_ARGUMENT)) {
  ipcRenderer.on(TEST_CRASH_CHANNEL, () => {
    process.crash()
  })
}
