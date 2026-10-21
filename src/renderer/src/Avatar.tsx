import type { CSSProperties } from 'react'
import type { AccountState } from '../../shared/api'
import { accountLetter, textColorOn } from './account-display'
import styles from './Avatar.module.css'

interface AvatarProps {
  account: AccountState
  /** The outer size of the avatar with its ring, in points. */
  size: number
}

/**
 * The avatar of an account: the profile photo inside a ring in the account color. If
 * Shifted has no photo, the first letter of the account name on the account color.
 */
function Avatar({ account, size }: AvatarProps): React.JSX.Element {
  const style = {
    '--account-color': account.color,
    '--avatar-size': `${size}px`
  } as CSSProperties
  return (
    <span className={styles.avatar} style={style} data-color={account.color} aria-hidden="true">
      {account.photo ? (
        <img className={styles.photo} src={account.photo} alt="" draggable={false} />
      ) : (
        <span className={styles.letter} style={{ color: textColorOn(account.color) }}>
          {accountLetter(account)}
        </span>
      )}
    </span>
  )
}

export default Avatar
