import { colors, fonts } from './styles';

/**
 * Email building blocks. Every function returns an inline HTML string ready
 * to drop into a layout. Each rides on inline style="..." attributes plus
 * a single CSS class for the dark-mode / mobile media queries — that
 * combination is the only pattern that survives all mail clients reliably
 * (Outlook strips classes loosely, Gmail strips <style> contexts, Apple
 * Mail respects both — inline always wins).
 *
 * Components compose flat (no JSX, no string interpolation gymnastics) and
 * are deliberately stateless so a template is just a sequence of calls.
 */

/**
 * Compact brand wordmark — small uppercase letterspaced rose text. Sits at
 * the top of every email card before the heading. Restrained on purpose;
 * the email content is the brand, the chrome is just a frame.
 */
export function brandHeader(): string {
  return `
    <div style="text-align:center; margin:0 0 32px 0;">
      <p style="font-family:${fonts.serif}; font-size:11px; letter-spacing:3px; color:${colors.accent}; margin:0; text-transform:uppercase; font-weight:normal;">
        The Secret Space
      </p>
    </div>
  `;
}

/**
 * Serif heading. h1 (default) is the page title; h2 is for in-card section
 * breaks. The class .ss-heading + .ss-text-fg pair lets the mobile media
 * query reduce the size and lets the dark-mode query swap the foreground
 * color, while every other property is inlined.
 */
export function heading(text: string, level: 1 | 2 = 1): string {
  const fontSize = level === 1 ? '30px' : '22px';
  return `
    <h${level} class="ss-heading ss-text-fg" style="font-family:${fonts.serif}; font-size:${fontSize}; color:${colors.foreground}; margin:0 0 16px 0; line-height:1.3; font-weight:normal; text-align:center;">
      ${text}
    </h${level}>
  `;
}

interface ParagraphOptions {
  muted?: boolean;
  align?: 'left' | 'center';
  bottomMargin?: number;
}

export function paragraph(text: string, opts: ParagraphOptions = {}): string {
  const color = opts.muted ? colors.muted : colors.foreground;
  const align = opts.align ?? 'center';
  const margin = opts.bottomMargin ?? 16;
  const className = opts.muted ? 'ss-text-muted' : 'ss-text-fg';
  return `
    <p class="${className}" style="font-family:${fonts.sans}; font-size:15px; line-height:1.65; color:${color}; margin:0 0 ${margin}px 0; text-align:${align};">
      ${text}
    </p>
  `;
}

/**
 * OTP / verification code display. Big monospaced glyphs with wide letter
 * spacing on a subtle panel so the digits are unmistakable and easy to
 * read off the screen onto another device.
 *
 * Mobile media query shrinks the font from 38px → 32px and the
 * letterspacing from 10px → 6px so a 6-digit code still fits in the
 * smallest reasonable email-client width.
 */
export function codeBlock(code: string): string {
  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:24px 0;">
      <tr>
        <td align="center" class="ss-code-panel" style="background:${colors.codePanel}; border-radius:12px; padding:28px 16px;">
          <div class="ss-code" style="font-family:${fonts.mono}; font-size:38px; letter-spacing:10px; color:${colors.accent}; font-weight:bold; line-height:1;">
            ${code}
          </div>
        </td>
      </tr>
    </table>
  `;
}

/**
 * Rose CTA button — VML for Outlook, anchor for everyone else. The "bulletproof
 * button" pattern: every modern client renders the anchor; Outlook renders the
 * VML <v:roundrect> instead because it can't handle border-radius on links.
 * Both arms produce visually-identical buttons.
 */
export function button(text: string, href: string): string {
  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto;">
      <tr>
        <td align="center" bgcolor="${colors.accent}" style="border-radius:10px;">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="20%" strokecolor="${colors.accent}" fillcolor="${colors.accent}">
            <w:anchorlock/>
            <center style="color:#ffffff;font-family:${fonts.sans};font-size:15px;font-weight:600;">${text}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-- -->
          <a href="${href}" style="display:inline-block; padding:14px 32px; font-family:${fonts.sans}; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:10px;">
            ${text}
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>
  `;
}

/**
 * Hairline divider. Used to separate the body from the footer-style
 * "Didn't request this?" notice without resorting to extra whitespace.
 */
export function divider(): string {
  return `<div class="ss-hairline" style="height:1px; background:${colors.hairline}; margin:28px 0; line-height:1px; font-size:0;">&nbsp;</div>`;
}

/**
 * Pure vertical spacer. Use when an extra margin on an adjacent component
 * isn't precise enough or would conflict with mobile media queries.
 */
export function spacer(height: number): string {
  return `<div style="height:${height}px; line-height:${height}px; font-size:0;">&nbsp;</div>`;
}

/**
 * Hidden preheader — the inbox preview line. Most clients show ~80–100
 * characters of body text after the subject; this element wins that slot
 * if we want the preview to read intentionally instead of leaking the
 * first words of the heading.
 *
 * The trailing &zwnj; padding is the standard trick: zero-width joiners
 * are invisible but eat up the slot so clients don't pull in real body
 * text after the preheader runs out.
 */
export function preheader(text: string): string {
  const pad = '&zwnj;&nbsp;'.repeat(70);
  return `
    <div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;">
      ${text}${pad}
    </div>
  `;
}
