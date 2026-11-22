/**
 * Redaction. The normalized model never stores environment values, so this is a
 * second line of defense for free-form strings that reach evidence, errors, or exports.
 */

export const REDACTED = "[REDACTED]";
const MAX_LEN = 200;

const SENSITIVE_KEY = /(pass(word|wd)?|secret|token|api[-_]?key|private[-_]?key|credential|auth|signature|dsn)/i;

/** True when an env/config key name suggests the value is sensitive. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

export function redact(input: string): string {
  let out = input;
  // scheme://user:password@host -> scheme://user:[REDACTED]@host
  out = out.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+):([^\s@/]+)@/gi, `$1:${REDACTED}@`);
  // KEY=value or KEY: value where KEY looks sensitive
  out = out.replace(
    /\b([A-Za-z0-9_.-]*(?:pass(?:word|wd)?|secret|token|api[-_]?key|private[-_]?key|credential|auth|dsn)[A-Za-z0-9_.-]*)\s*([=:])\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
    `$1$2${REDACTED}`,
  );
  // Long opaque tokens (>= 32 chars of base64/hex-ish) are replaced.
  out = out.replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g, REDACTED);
  return out.length > MAX_LEN ? `${out.slice(0, MAX_LEN)}…` : out;
}
