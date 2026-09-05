# Multi-device key architecture

## Scope

The current conversation identifier is `coupleId`. `Couple` owns `Message` rows and
the existing product has one relationship per user, so no separate conversation
identifier exists in the current data model.

The approved v2 data flow is:

```text
device keypair (private key stays on device)
    -> device registration and explicit authorization
conversation epoch key (created on an authorized client)
    -> per-device public-key envelope
message content key (created on an authorized client)
    -> wrapped by the epoch key
AES-GCM ciphertext + wrapped content key + epoch metadata
```

The backend stores and routes opaque ciphertext and envelopes only. It never receives
private keys, recovery secrets, epoch keys, message content keys, or plaintext.

## Lifecycle invariant

Each user device is `pending`, `active`, or `revoked`. The first installation is
explicitly bootstrapped after sign-in. Every later installation remains pending until
an active device approves a short-lived, single-use pairing token. Socket access
requires an active, non-revoked device identity.

The epoch API requires one envelope for every active device in the couple. Epoch
creation uses a client request id and a serializable transaction so retries are
idempotent and concurrent version allocation conflicts rather than silently creating
two current epochs.

## Compatibility boundary

Legacy messages retain `senderAesKey`, `recipientAesKey`, and the legacy user public
key for controlled migration. New devices must not overwrite `User.publicKey` while
pending. v2 message encryption is not enabled in the UI until the mobile client has
implemented local epoch-envelope unwrap, content-key wrapping, recovery, and legacy
migration.

This document describes the implemented lifecycle/opaque API slice; it is not a claim
that multi-device encryption is production complete.
