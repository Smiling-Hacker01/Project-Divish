/**
 * Email design tokens.
 *
 * Centralized so every template + component renders against one cohesive
 * palette. Picked for premium / romantic / trustworthy feel rather than
 * "SaaS verification screen":
 *   - Warm cream background instead of flat white — feels less corporate
 *   - Serif headings (Georgia is universally available on every mail client
 *     including Outlook and ancient Apple Mail) for elegance
 *   - System sans (Helvetica/Arial fallback chain) for body — readable on
 *     every device, no webfont required (webfonts are unreliable in email)
 *   - Single rose accent for CTAs + brand wordmark — restrained, never more
 *     than one accent surface per email so the eye knows where to land
 *
 * All values are HEX or pixel strings — emails can't reference design
 * tokens at runtime, so every component inlines these as literal strings.
 * Keep them in sync with the mobile theme's rose palette so the brand
 * impression survives the round-trip from email → app.
 */

export const colors = {
  // Page surface — warm off-white, softer than #FFFFFF. Common premium-email
  // background; reads as paper rather than as a UI surface.
  background: '#FAF7F4',

  // Card surface — pure white inside the warm page background so the body
  // copy has high contrast.
  card: '#FFFFFF',

  // Text — warm dark, NOT pure black. Pure black on cream reads as harsh.
  foreground: '#2A2422',
  muted: '#7A6F6B',

  // Brand accent (matches the mobile theme's primary rose).
  accent: '#E8637A',

  // Hairline / dividers — barely-visible warm grey.
  hairline: '#EDE7E1',

  // OTP code panel background — subtle warm tone that lifts the code off
  // the white card without competing with the rose accent.
  codePanel: '#FAF6F2',
} as const;

export const fonts = {
  serif: "Georgia, 'Times New Roman', Times, serif",
  // System sans stack. Email-safe (no web fonts required).
  sans: "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif",
  mono: "'SF Mono', SFMono-Regular, Menlo, Consolas, 'Courier New', monospace",
} as const;

export const sizes = {
  containerMax: 600, // canonical email content width
  cardPaddingDesktop: '40px 32px',
  cardPaddingMobile: '32px 24px',
  borderRadius: 16,
} as const;

/**
 * Returns the `<style>` block that goes inside <head>. Contains two
 * stylesheets that inline styles can't express:
 *   1. The mobile @media query that retightens padding + scales the
 *      OTP code on screens under 600px.
 *   2. The dark-mode @media query, supported by Apple Mail and partially
 *      by Gmail iOS / Outlook for Mac. Mail clients without support
 *      simply ignore the block — graceful degradation.
 *
 * We deliberately keep style-block CSS narrow and let every visual
 * property elsewhere ride on inline style="..." attributes. Most mail
 * clients aggressively strip or ignore <style> blocks; inline styles
 * are the only universally-honored vehicle for cosmetics.
 */
export function headStyles(): string {
  return `
    <style>
      /* Reset Outlook's default line-height behavior on tables */
      table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      /* Strip default link underlines on iOS Mail */
      a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }

      @media only screen and (max-width: 600px) {
        .ss-container { width: 100% !important; }
        .ss-card { padding: ${sizes.cardPaddingMobile} !important; }
        .ss-code { font-size: 32px !important; letter-spacing: 6px !important; }
        .ss-heading { font-size: 24px !important; }
      }

      @media (prefers-color-scheme: dark) {
        .ss-body { background: #0D0D0F !important; }
        .ss-card { background: #1A1A1C !important; }
        .ss-text-fg { color: #F2EDEA !important; }
        .ss-text-muted { color: #A09690 !important; }
        .ss-hairline { background-color: #2A2624 !important; }
        .ss-code-panel { background: #232024 !important; }
      }
    </style>
  `;
}
