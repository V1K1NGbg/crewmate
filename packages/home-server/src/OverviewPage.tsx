"use client";

import { formatBytes, formatTimestamp, formatUptime, parseOverview, usedPercent } from "./data";
import { useHomeResource } from "./useHomeResource";
import { Card, Page, ReadStatus } from "./ui";

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-1 text-sm"><dt className="text-text-2">{label}</dt><dd className="break-words">{value}</dd></div>;
}

export default function OverviewPage() {
  const resource = useHomeResource("/api/home/overview", parseOverview);
  const data = resource.data;
  const memoryPercent = data ? usedPercent(data.memory.totalBytes, data.memory.availableBytes) : null;
  return (
    <Page title="Overview" description="Host resources and independently reported service readiness." refresh={resource.refresh} loading={resource.loading}>
      <ReadStatus {...resource} />
      {data && <>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card title={data.hostname || "Host"}><dl>
            <Metric label="Uptime" value={formatUptime(data.uptimeSeconds)} />
            <Metric label="CPU cores" value={String(data.cpu.count)} />
            <Metric label="CPU usage" value={data.cpu.usagePercent === null ? "Unknown" : `${data.cpu.usagePercent.toFixed(1)}%`} />
            <Metric label="Load (1 minute)" value={data.cpu.load1.toFixed(2)} />
          </dl></Card>
          <Card title="Memory"><dl>
            <Metric label="Total" value={formatBytes(data.memory.totalBytes)} />
            <Metric label="Available" value={formatBytes(data.memory.availableBytes)} />
            <Metric label="Used" value={memoryPercent === null ? "Unknown" : `${memoryPercent.toFixed(1)}%`} />
          </dl></Card>
          <Card title="Temperatures">{data.temperatures.length === 0 ? <p className="text-sm text-text-2">No temperature readings reported.</p> : <dl>
            {data.temperatures.map((item, index) => <Metric key={`${item.label}-${index}`} label={item.label} value={`${item.celsius.toFixed(1)} °C`} />)}
          </dl>}</Card>
        </div>
        <Card title="Storage">
          {data.storage.length === 0 ? <p className="text-sm text-text-2">No storage readings reported.</p> : <ul className="grid gap-4 sm:grid-cols-2">
            {data.storage.map((disk, index) => {
              const used = usedPercent(disk.totalBytes, disk.freeBytes);
              return <li key={`${disk.label}-${index}`} className="min-w-0 rounded-lg border border-border-2 p-3">
                <h3 className="break-all text-sm font-medium">{disk.label}</h3>
                <p className="my-2 text-sm text-text-2">{formatBytes(disk.freeBytes)} free of {formatBytes(disk.totalBytes)}</p>
                {used === null ? <p className="text-sm">Usage unknown.</p> : <>
                  <meter aria-label={`${disk.label} storage used`} min={0} max={100} high={90} optimum={50} value={used} className="h-3 w-full" />
                  <p className="text-sm">{used.toFixed(1)}% used</p>
                  {used >= 90 && <p className="mt-2 text-sm text-warning">Low storage: protect space needed for the host, identity, and databases.</p>}
                </>}
              </li>;
            })}
          </ul>}
        </Card>
        <Card title="GPU">{data.gpu.length === 0 ? <p className="text-sm text-text-2">No GPU readings reported. This does not prove a GPU is absent.</p> : <div className="grid gap-4 sm:grid-cols-2">
          {data.gpu.map((gpu, index) => <div key={`${gpu.name}-${index}`}><h3 className="text-sm font-medium">{gpu.name}</h3><dl>
            <Metric label="Utilization" value={`${gpu.utilizationPercent.toFixed(1)}%`} />
            <Metric label="Memory" value={`${formatBytes(gpu.memoryUsedMiB * 1024 ** 2)} / ${formatBytes(gpu.memoryTotalMiB * 1024 ** 2)}`} />
            <Metric label="Temperature" value={`${gpu.temperatureCelsius.toFixed(1)} °C`} />
          </dl></div>)}
        </div>}</Card>
        <Card title="Service readiness">
          <p className="mb-3 text-sm text-text-2">pCloud synchronization and Immich indexing are separate processes. Unknown means not verified; a running container alone does not establish readiness.</p>
          {data.services.length === 0 ? <p className="text-sm">No readiness reports available.</p> : <ul className="grid gap-3 sm:grid-cols-2">
            {data.services.map((service) => <li key={service.id} className="rounded-lg border border-border-2 p-3">
              <h3 className="break-words text-sm font-medium">{service.id}: {service.status}</h3><p className="mt-1 break-words text-sm text-text-2">{service.detail || "No detail reported."}</p>
            </li>)}
          </ul>}
        </Card>
        <Card title="Recent failures">{data.recentFailures.length === 0 ? <p className="text-sm text-text-2">No recent failures reported.</p> : <ul className="flex flex-col gap-3">
          {data.recentFailures.map((failure, index) => <li key={`${failure.at}-${index}`} className="break-words text-sm"><p className="font-medium">{failure.operation}</p><p>{failure.message}</p><p className="text-xs text-text-2">{formatTimestamp(failure.at)}</p></li>)}
        </ul>}</Card>
      </>}
    </Page>
  );
}
