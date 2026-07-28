import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@crewmate/types",
    "@crewmate/state",
    "@crewmate/lib",
    "@crewmate/mail",
    "@crewmate/calendar",
    "@crewmate/notes",
    "@crewmate/tasks",
  ],
};

export default nextConfig;
