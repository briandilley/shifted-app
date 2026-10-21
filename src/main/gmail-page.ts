/**
 * Every assumption of Shifted about the markup of the Gmail page, and nothing else.
 *
 * Google can change the Gmail page at any time. When a lookup here stops working, fix it
 * in this module only.
 */
import type { WebContents } from 'electron'

/**
 * Where the profile photo of the account is in the Gmail page, most specific first.
 *
 * The photo is an `<img>` inside the account button at the top right of the Gmail page.
 * That button links to Google's "SignOutOptions" page in every language. The class
 * `gbii` marks the photo of the Google bar. The `aria-label` "Google Account: …" is in
 * English only, so it comes last.
 */
export const PROFILE_PHOTO_SELECTORS: readonly string[] = [
  'a[href*="SignOutOptions"] img',
  'img.gbii',
  'a[aria-label^="Google Account"] img'
]

/** How long the lookup waits for Gmail to show the account button. */
export const PROFILE_PHOTO_TIMEOUT_MS = 30_000

/** How often the lookup looks again while it waits. */
const PROFILE_PHOTO_INTERVAL_MS = 500

/**
 * The script that finds the profile photo in the Gmail page. Gmail draws its page after
 * the load event, so the script looks again until the photo shows or the time ends.
 *
 * The script returns a promise of the image URL, or of `null`. If the image has a
 * `srcset`, the script takes its largest image.
 */
export function profilePhotoScript(timeoutMs = PROFILE_PHOTO_TIMEOUT_MS): string {
  return `(() => {
  const selectors = ${JSON.stringify(PROFILE_PHOTO_SELECTORS)};
  const largest = (image) => {
    const candidates = (image.getAttribute('srcset') || '')
      .split(',')
      .map((part) => part.trim().split(/\\s+/))
      .filter((part) => part[0])
      .map((part) => ({ url: part[0], size: parseFloat(part[1] || '1') || 1 }))
      .sort((a, b) => b.size - a.size);
    const url = candidates.length > 0 ? new URL(candidates[0].url, document.baseURI).href : image.currentSrc || image.src;
    return /^https?:/i.test(url || '') ? url : null;
  };
  const find = () => {
    for (const selector of selectors) {
      for (const image of document.querySelectorAll(selector)) {
        const url = largest(image);
        if (url) return url;
      }
    }
    return null;
  };
  const deadline = Date.now() + ${timeoutMs};
  return new Promise((resolve) => {
    const look = () => {
      const url = find();
      if (url || Date.now() >= deadline) resolve(url);
      else setTimeout(look, ${PROFILE_PHOTO_INTERVAL_MS});
    };
    look();
  });
})()`
}

/**
 * Check the value that the lookup script returned. The value comes from a web page, so
 * Shifted accepts only an `http:` or `https:` URL.
 */
export function parseProfilePhotoUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 4096) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

/**
 * Find the profile photo of the account in the Gmail page.
 *
 * @param gmail The web contents of the Gmail view, after Gmail loaded.
 * @returns The image URL, or `undefined` if the page shows no photo.
 */
export async function findProfilePhotoUrl(gmail: WebContents): Promise<string | undefined> {
  const value: unknown = await gmail.executeJavaScript(profilePhotoScript())
  return parseProfilePhotoUrl(value)
}
