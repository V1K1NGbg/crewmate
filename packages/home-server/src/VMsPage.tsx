"use client";

import { useState } from "react";
import type { VirtualMachine, VMAction } from "@crewmate/types";
import { formatBytes, parseVMs } from "./data";
import { useHomeOperation } from "./useHomeOperation";
import { useHomeResource } from "./useHomeResource";
import { buttonClass, Card, ConfirmDialog, OperationStatus, Page, ReadStatus } from "./ui";

const actionLabels: Record<VMAction, string> = { start: "Start", shutdown: "Graceful shutdown", destroy: "Force stop" };

export default function VMsPage() {
  const resource = useHomeResource("/api/home/vms", parseVMs);
  const operation = useHomeOperation("/api/home/vms");
  const [confirmation, setConfirmation] = useState<{ vm: VirtualMachine; action: VMAction } | null>(null);

  function refresh() { resource.refresh(); void operation.check(); }
  async function confirm() {
    if (!confirmation) return;
    const { vm, action } = confirmation;
    setConfirmation(null);
    await operation.submit({ id: vm.id, action, confirm: true });
    resource.refresh();
  }

  return <Page title="Virtual machines" description="Control existing libvirt machines. Creating, deleting, and editing disks are not offered here." refresh={refresh} loading={resource.loading || operation.working}>
    <ReadStatus {...resource} />
    {operation.error && <p role="alert" className="text-sm text-danger">{operation.error}</p>}
    <OperationStatus operation={operation.operation} checking={operation.working} check={() => { void operation.check().then(resource.refresh); }} />
    {resource.data && (resource.data.vms.length === 0 ? <Card title="No virtual machines"><p className="text-sm text-text-2">The host reported no existing VMs. Provision machines through the host&apos;s approved administration workflow.</p></Card> :
      <ul className="grid gap-4 lg:grid-cols-2">{resource.data.vms.map((vm) => <li key={vm.id} className="min-w-0">
        <Card title={vm.name || vm.id}>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-text-2">State</dt><dd>{vm.state || "Unknown"}</dd>
            <dt className="text-text-2">ID</dt><dd className="break-all">{vm.id}</dd>
            <dt className="text-text-2">Assigned CPU</dt><dd>{vm.cpus}</dd>
            <dt className="text-text-2">Assigned RAM</dt><dd>{formatBytes(vm.memoryMiB * 1024 ** 2)}</dd>
            <dt className="text-text-2">Disk allocation</dt><dd>{formatBytes(vm.diskBytes)}</dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">{(["start", "shutdown", "destroy"] as const).map((action) =>
            <button key={action} type="button" disabled={(operation.blocked && !(action === "destroy" && operation.canForceStop(vm.id))) || resource.loading || Boolean(resource.error)}
              className={buttonClass} aria-label={`${actionLabels[action]} ${vm.name || vm.id}`} onClick={() => setConfirmation({ vm, action })}>{actionLabels[action]}</button>)}
          </div>
        </Card>
      </li>)}</ul>)}
    <p className="text-sm text-text-2">Actions are validated by the host against the current VM state. Graceful shutdown requests may take time; refresh the VM snapshot to see the resulting state.</p>
    {confirmation && <ConfirmDialog title={`${actionLabels[confirmation.action]} ${confirmation.vm.name || confirmation.vm.id}?`} confirmLabel={actionLabels[confirmation.action]} onCancel={() => setConfirmation(null)} onConfirm={() => { void confirm(); }}>
      {confirmation.action === "destroy" ? <p>Force stopping cuts power immediately and can lose unsaved data or corrupt the guest filesystem. Try graceful shutdown first.</p> : confirmation.action === "shutdown" ? <p>Request an orderly guest shutdown. Active work and network connections may be interrupted; completion is not guaranteed until the VM state changes.</p> : <p>Start this existing machine using its configured CPU, memory, disk, and network resources.</p>}
    </ConfirmDialog>}
  </Page>;
}
