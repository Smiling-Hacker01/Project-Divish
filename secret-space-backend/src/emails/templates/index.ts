/**
 * Template barrel. One file per email template; each exports a
 * `{ subject, preheader, html, text }` factory.
 *
 * Kept separate from the main emails/index.ts (which exports the framework
 * primitives) so call sites can be explicit about which templates they
 * pull in — easier to grep for usage when iterating on a template's copy.
 */

export { otpEmail } from './otp';
export type { OtpTemplateData, RenderedEmail } from './otp';
