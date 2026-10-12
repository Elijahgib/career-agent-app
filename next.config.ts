import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libSQL ships native bindings; keep it out of the server bundle.
  serverExternalPackages: ["@libsql/client", "libsql", "@prisma/adapter-libsql"],
  // No telemetry-style headers; keep responses minimal.
  poweredByHeader: false,
};

export default nextConfig;
