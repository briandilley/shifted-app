import { useState, type CSSProperties } from 'react'
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
 * Shifted has no photo, or the photo does not load, the first letter of the account name
 * on the account color.
 */
function Avatar({ account, size }: AvatarProps): React.JSX.Element {
  // The photo that did not load. A new photo gets a new try.
  const [brokenPhoto, setBrokenPhoto] = useState<string | null>(null)
  const photo = account.photo !== brokenPhoto ? account.photo : null
  const style = {
    '--account-color': account.color,
    '--avatar-size': `${size}px`
  } as CSSProperties
  return (
    <span className={styles.avatar} style={style} data-color={account.color} aria-hidden="true">
      {photo ? (
        <img
          className={styles.photo}
          src={photo}
          alt=""
          draggable={false}
          data-avatar-photo
          onError={() => setBrokenPhoto(photo)}
        />
      ) : (
        <span
          className={styles.letter}
          style={{ color: textColorOn(account.color) }}
          data-avatar-letter
        >
          {accountLetter(account)}
        </span>
      )}
    </span>
  )
}

export default Avatar
