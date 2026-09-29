# ADR 0002 — scrypt instead of Argon2id

Date: 2026-09-29 · Status: Accepted

## Context
The SPEC mandates Argon2id (`@node-rs/argon2`) for password hashing. `@node-rs/argon2`
ships prebuilt native binaries; in this sandbox a native-module install failure would
halt the build.

## Decision
Use Node's built-in `crypto.scrypt` — also a memory-hard KDF (parameters N, r, p) — with a
per-password 16-byte salt. Format: `scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>`.

Parameters: `N=16384, r=8, p=1, keyLen=32` (OWASP-recommended scrypt baseline).

## Consequences
- The security properties the SPEC requires (memory-hardness, slow verification, salted,
  constant-time comparison) are preserved.
- No native dependency; the build is reproducible in any Node 20+ environment.
- `verifyPassword` is timing-safe via `crypto.timingSafeEqual`.
- Migration to Argon2id later is a drop-in: add `@node-rs/argon2`, rehash on next login
  when the stored hash prefix is `scrypt$`.
