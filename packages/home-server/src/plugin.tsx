import { lazy } from "react";
import { Activity, Bot, Boxes, Images, Monitor, Shield } from "lucide-react";
import type { FeaturePlugin } from "@crewmate/types";

const common = {
  packageName: "@crewmate/home-server",
  enabledByDefault: true,
  defaultSettings: {},
};

export const homeServerPlugins: FeaturePlugin[] = [
  {
    ...common, id: "overview", label: "Overview", icon: Activity, color: "#38bdf8",
    description: "Host resources, storage, and service readiness.",
    Page: lazy(() => import("./OverviewPage")),
    SettingsSection: lazy(() => import("./HomeSettingsSection")),
  },
  {
    ...common, id: "photos", label: "Photos", icon: Images, color: "#fb923c",
    description: "Your read-only photo library in Immich.",
    Page: lazy(() => import("./ServicePage").then((module) => ({ default: module.PhotosPage }))),
  },
  {
    ...common, id: "containers", label: "Containers", icon: Boxes, color: "#60a5fa",
    description: "Container administration in Portainer.",
    Page: lazy(() => import("./ServicePage").then((module) => ({ default: module.ContainersPage }))),
  },
  {
    ...common, id: "ai", label: "AI", icon: Bot, color: "#a78bfa",
    description: "Local model availability and the existing assistant.",
    Page: lazy(() => import("./AIPage")),
  },
  {
    ...common, id: "vms", label: "Virtual machines", icon: Monitor, color: "#34d399",
    description: "Inspect and control existing virtual machines.",
    Page: lazy(() => import("./VMsPage")),
  },
  {
    ...common, id: "vpn", label: "VPN", icon: Shield, color: "#fbbf24",
    description: "WireGuard peer information and one-time provisioning.",
    Page: lazy(() => import("./VPNPage")),
  },
];
