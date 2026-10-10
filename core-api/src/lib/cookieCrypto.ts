/**
 * AIS UISAuth cookie encryption at rest.
 *
 * Uses AES-256-GCM (authenticated encryption) so that any tampering with the
 * stored ciphertext is detected at decrypt time.
 *
 * Environment variable required for encryption:
 *   AIS_COOKIE_ENCRYPTION_KEY  — exactly 64 hex characters (= 32 bytes).
 *
 * Generate a key:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * If the key is missing or invalid the functions degrade gracefully:
 *   • encryptCookie() returns the plaintext unchanged.
 *   • decryptCookie() returns the stored value unchanged (handles legacy rows).
 * This keeps the application functional even if the env var is not yet set,
 * while giving you a clear console warning on startup.
 *
 * Stored format (when encrypted):  enc:<iv-hex>:<tag-hex>:<ciphertext-hex>
 * Unencrypted legacy rows do NOT start with the "enc:" prefix.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'enc:';

let _encryptionKey: Buffer | null | undefined = undefined; // undefined = not yet resolved

function resolveKey(): Buffer | null {
  if (_encryptionKey !== undefined) return _encryptionKey;

  const hex = (process.env.AIS_COOKIE_ENCRYPTION_KEY ?? '').trim();

  if (!hex) {
    console.warn(
      '[cookieCrypto] AIS_COOKIE_ENCRYPTION_KEY is not set. ' +
        'AIS session cookies will be stored as plaintext. ' +
        'Set the env var in production!',
    );
    _encryptionKey = null;
    return null;
  }

  if (hex.length !== 64) {
    console.error(
      '[cookieCrypto] AIS_COOKIE_ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes). ' +
        'Falling back to plaintext storage.',
    );
    _encryptionKey = null;
    return null;
  }

  try {
    _encryptionKey = Buffer.from(hex, 'hex');
  } catch {
    console.error('[cookieCrypto] Failed to parse AIS_COOKIE_ENCRYPTION_KEY. Falling back to plaintext.');
    _encryptionKey = null;
  }

  return _encryptionKey;
}

/**
 * Encrypts a UISAuth cookie value before it is saved to the database.
 * Returns the encrypted string (enc:<iv>:<tag>:<ct>) or the original
 * plaintext if no encryption key is configured.
 */
export function encryptCookie(plaintext: string): string {
  const key = resolveKey();
  if (!key) return plaintext; // degrade gracefully

  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return (
    ENC_PREFIX +
    iv.toString('hex') +
    ':' +
    tag.toString('hex') +
    ':' +
    encrypted.toString('hex')
  );
}

/**
 * Decrypts a UISAuth cookie value that was previously encrypted by
 * encryptCookie().  If the value does not start with "enc:" it is assumed to
 * be a legacy plaintext row and is returned as-is.
 */
export function decryptCookie(stored: string): string {
  if (!stored.startsWith(ENC_PREFIX)) {
    // Legacy plaintext row — return as-is.
    return stored;
  }

  const key = resolveKey();
  if (!key) {
    // Cookie is encrypted but we have no key — session is unusable.
    throw new Error(
      'AIS session needs to be reconnected: encryption key is not configured on this server.',
    );
  }

  const inner = stored.slice(ENC_PREFIX.length);
  const parts = inner.split(':');
  if (parts.length !== 3) {
    throw new Error('Corrupted AIS session cookie format. Please reconnect to AIS.');
  }

  const [ivHex, tagHex, ciphertextHex] = parts;

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return decipher.update(ciphertext).toString('utf8') + decipher.final('utf8');
  } catch {
    throw new Error('Failed to decrypt AIS session cookie. Please reconnect to AIS.');
  }
}
