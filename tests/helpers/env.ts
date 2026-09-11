// Vitest setup file: runs before any test module (and therefore before
// src/lib/db.ts constructs its PrismaClient) is imported.
//
// resetDb() truncates User and every child table, so the suite must never
// point at the database a developer is actually using — signing up, saving
// alert configs and then running `npm test` used to wipe all of it. The suite
// runs against TEST_DATABASE_URL, defaulting to DATABASE_URL with `_test`
// appended to the database name, and refuses to run if the two resolve equal.

// Prisma loads .env itself when the client is constructed, which is too late
// for the guard below to see DATABASE_URL — load it here first. dotenv never
// overwrites a variable already present in the environment, so an explicitly
// exported TEST_DATABASE_URL/DATABASE_URL still wins.
import 'dotenv/config';

function withTestSuffix(url: string): string {
  try {
    const u = new URL(url);
    // pathname is "/<database>"; leave everything else (host, auth, params) alone
    u.pathname = `${u.pathname.replace(/\/$/, '')}_test`;
    return u.toString();
  } catch {
    return `${url}_test`;
  }
}

const devUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL ?? (devUrl ? withTestSuffix(devUrl) : undefined);

if (!testUrl) {
  throw new Error(
    'No database URL for the test suite: set TEST_DATABASE_URL (or DATABASE_URL, from which it is derived).'
  );
}
if (devUrl && testUrl === devUrl) {
  throw new Error(
    `Refusing to run the test suite against the development database (${testUrl}).\n` +
      'The suite truncates every table. Set TEST_DATABASE_URL to a separate database — see the README.'
  );
}

process.env.DATABASE_URL = testUrl;
process.env.AUTH_SECRET ??= 'test-secret';
process.env.PUBLIC_URL ??= 'http://localhost:3000';
