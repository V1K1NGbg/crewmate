import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: [
    "@crewmate/types",
    "@crewmate/state",
    "@crewmate/lib",
    "@crewmate/mail",
    "@crewmate/calendar",
    "@crewmate/notes",
    "@crewmate/tasks",
    "@crewmate/home-server",
  ],
};

export default nextConfig;
