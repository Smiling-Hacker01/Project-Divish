import { colors, fonts, sizes, headStyles } from './styles';
import { brandHeader, preheader as preheaderEl } from './components';

/**
 * Returns the full HTML document for an email. Wraps every template in the
 * same chrome: DOCTYPE + head + outer Outlook-friendly table + centered
 * 600px container + branded card + footer.
 *
 * The table-based layout is mandatory: Outlook for Windows uses the Word
 * rendering engine which doesn't understand flexbox / grid / margin auto,
 * but it DOES understand <table>. iOS Mail / Gmail / Apple Mail render
 * tables the same way, just less awkwardly. So we lose nothing by going
 * table-only and we gain Outlook compatibility — which still matters because
 * a chunk of users will receive these emails on corporate Outlook accounts.
 *
 * VML namespace declarations on <html> + the <!--[if mso]>...<![endif]-->
 * conditional comments are how we ship Outlook-specific markup (mainly the
 * bulletproof button + the PPI override that prevents Outlook from
 * upscaling images to 120 DPI). Every other client ignores these.
 *
 * Optional gradient hero block: when `hero` is provided, the email renders
 * a rose→gold gradient hero panel ABOVE the white content card, mirroring
 * the splash screen's brand gradient. The hero is for templates that need
 * visual identity (invites, partner-joined notifications, anniversary
 * reminders); transactional emails like OTP omit it and use the standard
 * brandHeader inside the white card.
 */
export interface LayoutHero {
  /** Small uppercase tracked label above the title (e.g. "THE SECRET SPACE"). */
  eyebrow?: string;
  /** Big serif headline rendered white on the gradient (e.g. "You're invited."). */
  title: string;
  /** Optional muted-white subtitle under the title. */
  subtitle?: string;
}

export interface LayoutOptions {
  subject: string;
  preheader: string;
  /** The inner card content — composed from components.ts helpers. */
  content: string;
  /** Optional rose→gold gradient hero block above the content card. */
  hero?: LayoutHero;
  /** Footer note text. Defaults to a copy-aware year + privacy reminder. */
  footer?: string;
}

export function layout({ subject, preheader, content, hero, footer }: LayoutOptions): string {
  const year = new Date().getUTCFullYear();
  const footerText =
    footer ??
    `The Secret Space · ${year}<br/>Keep this email private. Anything inside is meant only for you.`;

  // Hero block renders a rose→gold gradient with white text. The bgcolor
  // attribute provides the Outlook fallback (Word renderer doesn't handle
  // CSS gradients — it just paints the solid rose underneath). Every other
  // modern client renders the smooth gradient via the inline `background`
  // declaration. The hero's bottom corners are flat (border-radius 0)
  // because the white content card below it picks up the bottom radius —
  // together they form a single visual unit with the corners only at top
  // and bottom of the whole stack.
  const heroBlock = hero
    ? `
          <tr>
            <td class="ss-hero" align="center" bgcolor="${colors.accent}" style="background:${colors.accent}; background:linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentGold} 100%); padding:56px 32px; border-radius:${sizes.borderRadius}px ${sizes.borderRadius}px 0 0;">
              ${hero.eyebrow ? `<p style="font-family:${fonts.serif}; font-size:12px; letter-spacing:3px; color:rgba(255,255,255,0.85); margin:0 0 18px 0; text-transform:uppercase; font-weight:normal;">${escapeHtml(hero.eyebrow)}</p>` : ''}
              <h1 class="ss-hero-title" style="font-family:${fonts.serif}; font-size:40px; color:#FFFFFF; margin:0; line-height:1.15; font-weight:normal;">
                ${escapeHtml(hero.title)}
              </h1>
              ${hero.subtitle ? `<p style="font-family:${fonts.sans}; font-size:15px; color:rgba(255,255,255,0.92); margin:14px 0 0 0; line-height:1.5;">${escapeHtml(hero.subtitle)}</p>` : ''}
            </td>
          </tr>`
    : '';

  // When the hero is present we drop the small in-card brandHeader (it
  // would duplicate the visual identity that the hero already establishes)
  // AND we square off the top corners of the white card so it tucks under
  // the hero seamlessly.
  const cardRadius = hero
    ? `0 0 ${sizes.borderRadius}px ${sizes.borderRadius}px`
    : `${sizes.borderRadius}px`;
  const inCardBrandHeader = hero ? '' : brandHeader();

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  ${headStyles()}
</head>
<body class="ss-body" style="margin:0; padding:0; background:${colors.background}; -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;">
  ${preheaderEl(preheader)}

  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" bgcolor="${colors.background}" class="ss-body" style="background:${colors.background};">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table class="ss-container" role="presentation" border="0" cellpadding="0" cellspacing="0" width="${sizes.containerMax}" style="max-width:${sizes.containerMax}px; width:100%;">${heroBlock}
          <tr>
            <td class="ss-card" style="background:${colors.card}; border-radius:${cardRadius}; padding:${sizes.cardPaddingDesktop};">
              ${inCardBrandHeader}
              ${content}
            </td>
          </tr>

          <tr>
            <td style="padding:24px 16px; text-align:center;">
              <p class="ss-text-muted" style="font-family:${fonts.sans}; font-size:12px; color:${colors.muted}; margin:0; line-height:1.6;">
                ${footerText}
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Minimal HTML escape — we only render trusted backend-composed content
 * (template strings, user names, codes) so we don't need a full sanitizer,
 * but we DO need to handle the corner cases that a user-supplied name
 * might contain. Applied only to interpolated values, never to the
 * component HTML strings themselves.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
