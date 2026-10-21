import { SIGN_IN } from '../strings'
import styles from './SignInScreen.module.css'
import { useViewBounds } from './use-view-bounds'

/**
 * The sign-in window: the line of help on the backdrop at the top, and below it a card
 * where Google's sign-in page shows, in a web view with a radius of 12.
 */
function SignInScreen(): React.JSX.Element {
  const signInPageRef = useViewBounds<HTMLDivElement>()

  return (
    <div className={styles.window}>
      <p className={styles.topLine}>
        {window.shifted.platform === 'win32' ? SIGN_IN.passkeyHelpWindows : SIGN_IN.passkeyHelp}
      </p>
      <div ref={signInPageRef} className={styles.signInPage} />
    </div>
  )
}

export default SignInScreen
