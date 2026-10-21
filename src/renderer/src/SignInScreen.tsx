import styles from './SignInScreen.module.css'
import { useViewBounds } from './use-view-bounds'

const PASSKEY_HELP =
  'Passkeys do not work in Shifted on this computer. If Google asks for a passkey, click "Try another way" and use your password.'
const PASSKEY_HELP_WINDOWS = 'If Google asks for a passkey, Windows Hello opens.'

/** The top line of the sign-in window. Google's sign-in page shows below it. */
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
