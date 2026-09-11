export { auth as proxy } from '@/auth';

// Overlay and alert API routes must stay outside auth: OBS loads the overlay with
// no cookie, and the API authenticates by ingest key.
export const config = { matcher: ['/dashboard/:path*'] };
