import { useEffect, useRef, useState } from 'react'
import type { AccountState } from '../../shared/api'
import { accountLabel, accountTooltip } from './account-display'
import Avatar from './Avatar'
import styles from './Sidebar.module.css'

/** The pointer must move this far, in points, before a press becomes a drag. */
const DRAG_THRESHOLD = 5

interface SidebarProps {
  accounts: AccountState[]
  selectedAccountId: string | null
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
 * The sidebar: one avatar for each account, in the order of the configuration, and the
 * add-account button below the list. Drag an account to a new place to change the order.
 */
function Sidebar({ accounts, selectedAccountId }: SidebarProps): React.JSX.Element {
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

  return (
    <nav className={styles.sidebar} aria-label="Accounts">
      <ul className={styles.list}>
        {shown.map((account) => {
          const selected = account.id === selectedAccountId
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
                <Avatar account={account} size={44} />
                {/* Prompt 04 puts the unread badge here. */}
                <span className={styles.badgeSlot} aria-hidden="true" />
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
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </nav>
  )
}

export default Sidebar
