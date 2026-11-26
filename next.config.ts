import type { NextConfig } from "next";

// Cache Components is intentionally off: every internal page reads the
// signed-in session and per-user RLS data, so pages render per request.
// See docs/adr/0003-rendering-and-auth.md.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  // `next dev` only trusts localhost by default. Sign-in links and cookies use
  // 127.0.0.1 (README step 6), so without this the dev server blocks the page's
  // client scripts there and buttons like "Set up authenticator app" do nothing.
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
