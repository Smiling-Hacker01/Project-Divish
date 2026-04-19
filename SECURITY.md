# Security Policy

The Secret Space (Divish) takes the privacy and security of our users' relationship data extremely seriously. As a deeply personal application featuring a Biometric Vault, we prioritize strict security protocols.

## Application Security Measures
1. **Biometric Exclusivity**: The Vault is natively bound to Android's `BiometricManager`. We enforce hardware-level physical/in-display scanner verification before granting access to sensitive APIs.
2. **Proprietary Software**: The codebase is protected under strict proprietary copyright. Forks, reproductions, or public deployments are strictly prohibited.
3. **Secure Communications**: All data transported between the backend and Android client is encrypted over HTTPS.
4. **Token Handling**: We exclusively use short-lived JWT access tokens backed by securely vaulted Refresh Tokens.

## Reporting a Vulnerability
Because this is a proprietary application protecting highly personal user data, we ask that you follow responsible disclosure protocols:

1. **Do not create public GitHub issues** for security vulnerabilities. Disclosure must remain private until patched.
2. Please communicate any potential vulnerabilities, exploits, or data leak risks by privately contacting the project owner / lead developer directly.
3. We will acknowledge receipt of your vulnerability report within 48 hours and strive to deploy a rapid backend or APK patch upon validation.

Thank you for respecting our legal bounds and helping keep our application safe.
