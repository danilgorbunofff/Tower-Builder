import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* The probe suite drives the dev server by IP (baseline/run-probes.mjs --base
     http://127.0.0.1:3000), and Next treats any /_next/* fetch whose origin is
     not the dev server's own host as cross-origin and refuses it. The page still
     returns 200 with the server-rendered frame, so the failure is silent: React
     never hydrates and the engine never boots, which reads as "the tower did not
     build" in every probe at once. Dev only -- there is no such check in a
     production build. */
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
