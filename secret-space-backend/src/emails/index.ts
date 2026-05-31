/**
 * Email framework barrel. Templates live in `./templates/*` and import
 * components / layout / client from here so consuming code never has to
 * reach into individual files.
 *
 * Adding a new email template:
 *   1. Create `templates/<name>.ts` exporting a `{ subject, html, text, preheader }`
 *      factory that takes whatever data the template needs.
 *   2. Re-export it from `templates/index.ts`.
 *   3. Call site: `import { fooTemplate } from '../emails/templates'; await sendEmail({ to, ...fooTemplate(data) })`.
 */

export { sendEmail } from './client';
export type { SendEmailOptions } from './client';

export { layout } from './layout';
export type { LayoutOptions } from './layout';

export {
  brandHeader,
  heading,
  paragraph,
  codeBlock,
  button,
  divider,
  spacer,
  preheader,
} from './components';

export { colors, fonts, sizes, headStyles } from './styles';
