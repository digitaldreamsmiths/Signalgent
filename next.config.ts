import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ['@anthropic-ai/sdk'],
  // /outreach has no view of its own. This used to be a server `redirect()` in
  // app/(app)/outreach/page.tsx, but a redirect thrown from a page after the
  // async app layout has started streaming is replayed on the client during
  // hydration, and Next 16.2's Router then throws "Rendered more hooks than
  // during the previous render" on every hard load of /outreach. Redirecting
  // at the config level answers with a 307 before anything renders.
  async redirects() {
    return [{ source: '/outreach', destination: '/outreach/pipeline', permanent: false }]
  },
};
export default nextConfig;
