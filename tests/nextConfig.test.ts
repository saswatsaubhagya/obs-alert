import { expect, test } from 'vitest';
import nextConfig from '../next.config';

// M2: the spec permits same-origin framing only (the dashboard preview iframe).
test('the overlay route is served with frame-ancestors self', async () => {
  const entries = await nextConfig.headers!();
  const overlay = entries.find((e) => e.source.startsWith('/overlay'));
  expect(overlay, 'no headers entry for the overlay route').toBeDefined();
  const csp = overlay!.headers.find((h) => h.key.toLowerCase() === 'content-security-policy');
  expect(csp?.value).toContain("frame-ancestors 'self'");
});
