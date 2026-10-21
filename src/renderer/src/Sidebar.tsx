import { Import, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { unreadBadgeText, type AccountState } from '../../shared/api'
import { accountLabel, accountTooltip, unreadDescription } from './account-display'
import Avatar from './Avatar'
import styles from './Sidebar.module.css'

/** The pointer must move this far, in points, before a press becomes a drag. */
const DRAG_THRESHOLD = 5

/** The height of the slot of one account, and the space between two slots, in points. */
const SLOT_HEIGHT = 52
const SLOT_GAP = 10

interface SidebarProps {
  accounts: AccountState[]
  selectedAccountId: string | null
  /** Show "Import configuration…" below "Add account". The main window does it with no accounts. */
  showImport: boolean
}

interface Drag {
  accountId: string
  /** The vertical position of the pointer when the press started. */
  startY: number
  /** True after the pointer moved past the threshold. */
  moving: boolean
  /** The middle of each account, from top to bottom, when the press started. */
  middles: { accountId: string; y: number }[]
  /** The place where the account lands if you let go now. */
  toIndex: number
}

/** Move one id to a new place in a list of ids. */
function moveId(ids: string[], id: string, toIndex: number): string[] {
  const rest = ids.filter((candidate) => candidate !== id)
  rest.splice(Math.min(Math.max(0, toIndex), rest.length), 0, id)
  return rest
}

/** Put the accounts in the order of the ids. */
function inOrder(accounts: AccountState[], ids: string[]): AccountState[] {
  const byId = new Map(accounts.map((account) => [account.id, account]))
  const ordered = ids.flatMap((id) => byId.get(id) ?? [])
  return ordered.length === accounts.length ? ordered : accounts
}

/**
 * The unread badge on the corner of the avatar: the unread count, nothing for 0, or a
 * warning mark when the last read of the feed failed. The tooltip of the warning mark
 * says why.
 */
function UnreadBadge({ account }: { account: AccountState }): React.JSX.Element | null {
  if (account.unreadWarning !== null) {
    return (
      <span
        className={`${styles.badge} ${styles.warning}`}
        title={account.unreadWarning}
        data-unread-badge="warning"
        aria-hidden="true"
      >
        !
      </span>
    )
  }
  const text = unreadBadgeText(account.unreadCount ?? 0)
  if (!text) return null
  return (
    <span className={styles.badge} data-unread-badge="count" aria-hidden="true">
      {text}
    </span>
  )
}

/**
 * The sidebar: one avatar for each account, in the order of the configuration, and the
 * add-account button below the list. Drag an account to a new place to change the order.
 */
function Sidebar({ accounts, selectedAccountId, showImport }: SidebarProps): React.JSX.Element {
  const [drag, setDrag] = useState<Drag | null>(null)
  // After a drop, the new order shows until the main process sends it back.
  const [dropped, setDropped] = useState<{ ids: string[]; from: AccountState[] } | null>(null)
  const items = useRef(new Map<string, HTMLElement>())
  const dragRef = useRef<Drag | null>(null)
  const ignoreClick = useRef(false)

  const ids = accounts.map((account) => account.id)
  let shown = accounts
  if (drag?.moving) shown = inOrder(accounts, moveId(ids, drag.accountId, drag.toIndex))
  else if (dropped && dropped.from === accounts) shown = inOrder(accounts, dropped.ids)

  // Stop listening to the pointer if the sidebar goes away during a drag.
  const stopDrag = useRef<(() => void) | null>(null)
  useEffect(() => () => stopDrag.current?.(), [])

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, accountId: string): void => {
    if (event.button !== 0 || !event.isPrimary) return
    const middles = accounts.flatMap((account) => {
      const element = items.current.get(account.id)
      if (!element) return []
      const rect = element.getBoundingClientRect()
      return [{ accountId: account.id, y: rect.top + rect.height / 2 }]
    })
    const start: Drag = {
      accountId,
      startY: event.clientY,
      moving: false,
      middles,
      toIndex: ids.indexOf(accountId)
    }
    dragRef.current = start

    const move = (moveEvent: PointerEvent): void => {
      const current = dragRef.current
      if (!current) return
      if (!current.moving && Math.abs(moveEvent.clientY - current.startY) < DRAG_THRESHOLD) return
      // The new place is the number of other accounts whose middle is above the pointer.
      const toIndex = current.middles.filter(
        (middle) => middle.accountId !== current.accountId && middle.y < moveEvent.clientY
      ).length
      const next = { ...current, moving: true, toIndex }
      dragRef.current = next
      setDrag(next)
    }
    const end = (endEvent: PointerEvent): void => {
      stop()
      const current = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!current?.moving || endEvent.type === 'pointercancel') return
      // The click that follows the drop must not select the account.
      ignoreClick.current = true
      setTimeout(() => {
        ignoreClick.current = false
      }, 0)
      if (current.toIndex !== ids.indexOf(current.accountId)) {
        setDropped({ ids: moveId(ids, current.accountId, current.toIndex), from: accounts })
        window.shifted.moveAccount(current.accountId, current.toIndex)
      }
    }
    const stop = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      stopDrag.current = null
    }
    stopDrag.current?.()
    stopDrag.current = stop
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, accountId: string): void => {
    // Alt+Up and Alt+Down move the account, for people who do not use a mouse.
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    const index = ids.indexOf(accountId)
    const toIndex = event.key === 'ArrowUp' ? index - 1 : index + 1
    if (toIndex < 0 || toIndex >= ids.length) return
    window.shifted.moveAccount(accountId, toIndex)
  }

  const selectedIndex = shown.findIndex((account) => account.id === selectedAccountId)

  return (
    <nav className={styles.sidebar} aria-label="Accounts">
      <ul className={styles.list}>
        {selectedIndex >= 0 && (
          // The selection tile behind the selected account. It joins the content area, and
          // it slides to the new slot when the selected account changes.
          <li
            className={styles.selectionTile}
            style={
              {
                '--tile-offset': `${selectedIndex * (SLOT_HEIGHT + SLOT_GAP)}px`
              } as CSSProperties
            }
            aria-hidden="true"
            data-selection-tile
          />
        )}
        {shown.map((account) => {
          const selected = account.id === selectedAccountId
          const unread = unreadDescription(account)
          const unreadId = `unread-${account.id}`
          const dragging = drag?.moving === true && drag.accountId === account.id
          return (
            <li
              key={account.id}
              ref={(element) => {
                if (element) items.current.set(account.id, element)
                else items.current.delete(account.id)
              }}
              className={[
                styles.item,
                selected ? styles.selected : '',
                dragging ? styles.dragging : ''
              ].join(' ')}
            >
              <button
                type="button"
                className={styles.account}
                aria-label={accountLabel(account)}
                aria-current={selected ? 'true' : undefined}
                aria-describedby={unread ? unreadId : undefined}
                title={accountTooltip(account)}
                data-account-id={account.id}
                onClick={() => {
                  if (!ignoreClick.current) window.shifted.selectAccount(account.id)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  window.shifted.showAccountMenu(account.id)
                }}
                onPointerDown={(event) => startDrag(event, account.id)}
                onKeyDown={(event) => onKeyDown(event, account.id)}
              >
                <Avatar account={account} size={38} />
                <UnreadBadge account={account} />
                {unread && (
                  <span id={unreadId} hidden>
                    {unread}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        className={styles.addAccount}
        aria-label="Add account"
        title="Add account"
        onClick={() => window.shifted.addAccount()}
      >
        <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {showImport && (
        // With no accounts, "Import configuration…" sits next to "Add account".
        <button
          type="button"
          className={styles.importConfiguration}
          aria-label="Import configuration…"
          title="Import configuration…"
          onClick={() => window.shifted.openImportWindow()}
        >
          <Import size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      )}
    </nav>
  )
}

export default Sidebar
