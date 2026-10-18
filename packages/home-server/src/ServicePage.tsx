"use client";

import { approvedUrl, parseServices } from "./data";
import { useHomeResource } from "./useHomeResource";
import { buttonClass, Card, Page, ReadStatus } from "./ui";

function ServicePage({ service }: { service: "photos" | "containers" }) {
  const resource = useHomeResource("/api/home/services", parseServices);
  const photos = service === "photos";
  const name = photos ? "Immich" : "Portainer";
  const url = approvedUrl(photos ? resource.data?.photosUrl : resource.data?.containersUrl);
  return (
    <Page title={photos ? "Photos" : "Containers"} description={photos ? "Browse the local pCloud library in Immich. Originals are intended to be mounted read-only." : "Use Portainer for container administration; deployment definitions remain server-managed."} refresh={resource.refresh} loading={resource.loading}>
      <ReadStatus {...resource} />
      {url ? <>
        <div className="flex flex-wrap items-center gap-3">
          <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass}>Open {name} directly <span className="sr-only">in a new tab</span></a>
          <p className="text-sm text-text-2">Use the private link if framing or sign-in is blocked. Embedding does not establish single sign-on.</p>
        </div>
        <iframe src={url} title={`${name} private application`} referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
          className="h-[70dvh] min-h-96 w-full rounded-xl border border-border bg-surface" />
      </> : !resource.loading && !resource.error && <Card title={`${name} needs server setup`}>
        <p className="text-sm text-text-2">No approved HTTPS endpoint is configured. Configure the private service address, shared login, and exact framing origin on the server. This page cannot edit application URLs or provision the service.</p>
      </Card>}
      {photos && <p className="text-sm text-text-2">pCloud synchronization is not a backup and may propagate changes or deletions. Sync health and Immich indexing health are shown separately in Overview.</p>}
    </Page>
  );
}

export function PhotosPage() { return <ServicePage service="photos" />; }
export function ContainersPage() { return <ServicePage service="containers" />; }
