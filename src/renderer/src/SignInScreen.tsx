import styles from './SignInScreen.module.css'
import { useViewBounds } from './use-view-bounds'

const PASSKEY_HELP =
  'Passkeys do not work in Shifted on this computer. If Google asks for a passkey, click "Try another way" and use your password.'
const PASSKEY_HELP_WINDOWS = 'If Google asks for a passkey, Windows Hello opens.'

/**
 * The sign-in window: the line of help on the backdrop at the top, and below it a card
 * where Google's sign-in page shows, in a web view with a radius of 12.
 */
function SignInScreen(): React.JSX.Element {
  const signInPageRef = useViewBounds<HTMLDivElement>()

  return (
    <div className={styles.window}>
      <p className={styles.topLine}>
        {window.shifted.platform === 'win32' ? PASSKEY_HELP_WINDOWS : PASSKEY_HELP}
      </p>
      <div ref={signInPageRef} className={styles.signInPage} />
    </div>
  )
}

export default SignInScreen
