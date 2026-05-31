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
 */
export interface LayoutOptions {
  subject: string;
  preheader: string;
  /** The inner card content — composed from components.ts helpers. */
  content: string;
  /** Footer note text. Defaults to a copy-aware year + privacy reminder. */
  footer?: string;
}

export function layout({ subject, preheader, content, footer }: LayoutOptions): string {
  const year = new Date().getUTCFullYear();
  const footerText =
    footer ??
    `The Secret Space · ${year}<br/>Keep this email private. Anything inside is meant only for you.`;

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

        <table class="ss-container" role="presentation" border="0" cellpadding="0" cellspacing="0" width="${sizes.containerMax}" style="max-width:${sizes.containerMax}px; width:100%;">
          <tr>
            <td class="ss-card" style="background:${colors.card}; border-radius:${sizes.borderRadius}px; padding:${sizes.cardPaddingDesktop};">
              ${brandHeader()}
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
