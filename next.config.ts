import type { NextConfig } from "next";

// Spec: "Framing is permitted same-origin only, for the dashboard preview
// iframe." Nothing enforced that, so any site could embed a streamer's overlay
// (the token is the only secret it carries) in a hidden frame. `frame-ancestors
// 'self'` keeps the dashboard's own preview iframe working — it is same-origin
// — and blocks every other embedder. CSP rather than X-Frame-Options because
// only CSP is honoured by current browsers for this.
const OVERLAY_FRAME_POLICY = "frame-ancestors 'self'";

const nextConfig: NextConfig = {
  // Trace only the files the server actually imports into `.next/standalone`,
  // instead of shipping the whole 754MB node_modules. Cuts the image from
  // ~1.5GB to a few hundred MB. The runtime stage copies standalone/ plus
  // .next/static and public/, which tracing deliberately does not include.
  output: 'standalone',

  async headers() {
    return [
      {
        source: '/overlay/:token',
        headers: [{ key: 'Content-Security-Policy', value: OVERLAY_FRAME_POLICY }],
      },
    ];
  },
};

export default nextConfig;
