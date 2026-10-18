"use client";

import { approvedUrl, parseServices } from "./data";
import { useHomeResource } from "./useHomeResource";
import { buttonClass, Card, ReadStatus } from "./ui";

export default function HomeSettingsSection() {
  const resource = useHomeResource("/api/home/services", parseServices);
  return <div className="flex min-w-0 flex-col gap-4 text-text">
    <p className="text-sm text-text-2">Read-only server configuration. Endpoint, identity, firewall, and deployment changes belong on the server, not in browser preferences.</p>
    <button type="button" className={`${buttonClass} self-start`} disabled={resource.loading} onClick={resource.refresh}>Refresh configuration</button>
    <ReadStatus {...resource} />
    {resource.data && <Card title="Approved private endpoints"><dl className="flex flex-col gap-3 text-sm">
      {([ ["Photos / Immich", resource.data.photosUrl], ["Containers / Portainer", resource.data.containersUrl], ["Owner identity", resource.data.identityUrl] ] as const).map(([label, value]) => {
        const url = approvedUrl(value);
        return <div key={label}><dt className="font-medium">{label}</dt><dd className="break-all text-text-2">{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent underline focus-visible:outline-2">{url}<span className="sr-only"> (opens in a new tab)</span></a> : "Not configured"}</dd></div>;
      })}
    </dl></Card>}
    <Card title="Owner and access"><p className="text-sm text-text-2">Single-owner access, private LAN/VPN application routes, and server-only WireGuard routing must be enforced by the configured identity gateway and host firewall. Their deployment and external reachability are not verified by this screen. Keep an independent local recovery route.</p></Card>
    <Card title="Google integration"><p className="text-sm text-text-2">{resource.data?.googleDeferred === false ? "Google is not marked deferred by the server. This screen does not verify Google authorization or provision accounts." : "Google authorization is deferred. It is not required for local server administration, and no Google provisioning is offered here."}</p></Card>
  </div>;
}
