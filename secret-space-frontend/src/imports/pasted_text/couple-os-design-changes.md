Figma Design Change Request — The Secret Space: Couple OS
1. Registration Flow — OTP Verification
During initial signup for both User A and User B, add email OTP verification as part of the registration process:

After the user enters their name, email, and password and taps "Continue," immediately send a 6-digit OTP to their registered email
Show a dedicated OTP verification screen — 6 individual input boxes, auto-focus on first box, auto-advance on each digit entry
Include a "Resend OTP" option (greyed out with a 30-second countdown timer, then becomes tappable)
Only after OTP is successfully verified does the user proceed to face enrollment
If OTP fails or expires: gentle inline error — "That code didn't match. Try again or resend."
This applies to both User A (initiator) and User B (partner joining with couple code)

Updated registration step flow:

Enter Details → Verify Email (OTP) → Face Enrollment → Couple Code / Join → Inside App


2. Face Enrollment During Registration — Optional with OTP Fallback
Face enrollment during registration is attempted but not mandatory. The user must complete at least one of the two MFA methods to proceed:

After email OTP verification, the app attempts face enrollment as the preferred MFA method
If face enrollment succeeds → user proceeds normally with face as their MFA method
If face enrollment fails or the user skips it → show a gentle message:
"No worries — you can set up Face ID later. You're secured with OTP for now."
User is then allowed to proceed into the app using OTP-based MFA as their active verification method
Inside Settings, a clear option: "Set Up Face ID" — so the user can enroll their face anytime later at their convenience
Rule: At least one MFA method (Face or OTP) must always be active per user. The app should never allow a state where both are disabled

Updated registration step flow with fallback:

Enter Details → Verify Email (OTP) → Attempt Face Enrollment → [Success: Face MFA active] / [Fail or Skip: OTP MFA active, Face setup available later] → Inside App


3. Login Flow (Post-Registration)
After both partners complete registration, a proper returning login screen is needed with multiple entry paths:

Primary login method: Password + Face Verification (for users who completed face enrollment)
OTP-based login: Available as the primary method for users who skipped face enrollment, and as a fallback for users whose face verification fails at login
OTP-only login option: A secondary CTA on the main login screen — "Login with OTP" — visible to all users regardless of their MFA method
The login screen should feel like a gentle, secure entry point — soft lock icon, app branding, two clearly separated login paths


4. Face Mismatch at Login — Fallback & Error State
When face verification fails at login, show a clear and calm fallback:

Face mismatch error state: Gentle error message — "We couldn't verify your face" — with two options:

"Try Again" (retry camera)
"Login with OTP instead"


OTP is sent to registered email on selecting fallback
Error states should feel soft and non-alarming — warm amber tones, not harsh red
After successfully logging in via OTP fallback, show a soft prompt inside the app: "Want to re-enroll your face for easier login?" with a direct link to Face ID setup in Settings


5. Vault Screen — Upload Options & Navigation
Upload flow fix:
When the user taps the "+" / Add button inside the Vault, show a bottom sheet action menu with three options:

📷 Take Photo (live camera)
🎥 Record Video (live camera)
🖼 Choose from Gallery

Each option should have an icon, label, and subtle separator. The sheet should have a drag handle and a cancel option.
Navigation fix:
Add a back button (chevron left icon, top-left corner) on all Vault screens — the main vault grid, the upload flow, and the full-screen media viewer. Currently there is no way to return to the previous screen.

6. Home Dashboard — Couple Profile Photo
Replace the word "Us" on the home screen header with a circular couple profile photo component:

A round image frame (64–80px) where the couple can upload a shared photo together
Tapping it opens a simple editor to upload or retake the couple photo
Default/empty state: Two overlapping avatar initials with a soft gradient background and a small camera icon overlay indicating it's editable
Position it centered or left-aligned in the header, paired with a subtle couple nickname or heart icon


7. Home Dashboard — Bottom Section (Empty Space)
Fill the empty bottom area with a "Reasons to Never Give Up on Each Other" daily thought card:

Softly styled card with a quote-like layout — large quotation mark icon, italic text, subtle branding below
Thoughts rotate daily and auto-generate — examples:

"Every relationship has hard days. Staying anyway is the whole point."
"You chose each other once. Choose each other again today."
"The little moments are the big moments, looking back."


Subtle swipe or refresh gesture to load a new thought
Small label above: "A thought for today 💛"
Card background: soft warm gradient or frosted translucent surface
Warm and gentle in tone — never preachy


Summary of All Changes
#ScreenChange1RegistrationAdd OTP email verification step for both User A and User B during signup2RegistrationFace enrollment is attempted but optional — OTP MFA activates as fallback if face fails or is skipped. At least one MFA must be active3SettingsAdd "Set Up Face ID" option so users can enroll face anytime after registration4LoginReturning login screen with face+password as primary, OTP as fallback and standalone option5LoginFace mismatch error state with OTP fallback + post-login prompt to re-enroll face6VaultReplace add button with bottom sheet: Camera / Video / Gallery7VaultAdd back navigation button on all vault screens8Home HeaderReplace "Us" text with circular couple profile photo component9Home BottomAdd auto-generated daily thought card — "Reasons to Never Give Up"