#!/usr/bin/env node
/**
 * Nexora-India — Admin password hash generator.
 *
 * Produces a PBKDF2-SHA256 hash string in exactly the format expected by
 * functions/api/_utils.js (verifyAdminPassword):
 *
 *   pbkdf2-sha256$<iterations>$<salt-base64>$<hash-base64>
 *
 * Usage:
 *   node scripts/generate-admin-hash.js "your-admin-password"
 *
 * Output: just the hash string — copy it into the Cloudflare Pages
 * environment variable ADMIN_PASSWORD_HASH (or ADMIN_PASSWORD as a
 * plain-text fallback for dev/staging only).
 *
 * The password itself is never stored anywhere.
 */
const crypto = require("crypto");

const ITERATIONS = 600000; // within the 100000..1000000 range accepted by _utils.js
const SALT_BYTES = 16; // >= 16 required
const KEY_LENGTH = 32; // SHA-256 output, 32 bytes required

function main() {
  const password = process.argv[2];
  if (!password) {
    console.error(
      "Usage: node scripts/generate-admin-hash.js \"your-password\"\n" +
      "  (password must not be empty)"
    );
    process.exit(1);
  }

  const salt = crypto.randomBytes(SALT_BYTES);
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, "sha256");

  const hashString =
    "pbkdf2-sha256$" +
    ITERATIONS + "$" +
    salt.toString("base64") + "$" +
    hash.toString("base64");

  console.log(hashString);
  console.error(
    "Set this as the ADMIN_PASSWORD_HASH environment variable in Cloudflare Pages " +
    "(Settings -> Environment variables).",
  );
}

main();
