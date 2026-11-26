import type { NextConfig } from "next";

// Cache Components is intentionally off: every internal page reads the
// signed-in session and per-user RLS data, so pages render per request.
// See docs/adr/0003-rendering-and-auth.md.
const nextConfig: NextConfig = {
  poweredByHeader: false,
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
