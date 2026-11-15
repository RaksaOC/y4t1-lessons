import type { NextConfig } from "next";

/* The study hub itself is plain HTML/JS/CSS in public/ and is served as-is.
   Next.js only adds the API routes in app/api, which hold the voice keys. */
const config: NextConfig = {
  poweredByHeader: false,
  output: "standalone", // small self-contained server for the Docker image
  async rewrites() {
    return { beforeFiles: [{ source: "/", destination: "/index.html" }], afterFiles: [], fallback: [] };
  },
};

export default config;
