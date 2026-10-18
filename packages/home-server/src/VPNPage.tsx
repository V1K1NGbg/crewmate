"use client";

import { useId, useState } from "react";
import { useApp } from "@crewmate/state";
import type { VPNPeer } from "@crewmate/types";
import { formatBytes, formatTimestamp, parseVPN, validPeerName } from "./data";
import { useHomeOperation } from "./useHomeOperation";
import { useHomeResource } from "./useHomeResource";
import { buttonClass, Card, ConfirmDialog, inputClass, OperationStatus, Page, ReadStatus } from "./ui";
import ProvisionConfiguration from "./ProvisionConfiguration";

type Confirmation = { action: "add"; name: string } | { action: "revoke"; peer: VPNPeer };

function VPNControls() {
  const resource = useHomeResource("/api/home/vpn", parseVPN);
  const operation = useHomeOperation("/api/home/vpn");
  const [name, setName] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [configuration, setConfiguration] = useState<string | null>(null);
  const nameId = useId();
  const helpId = useId();
  const invalidName = name.length > 0 && !validPeerName(name);

  function refresh() { resource.refresh(); void operation.check(); }
  async function confirm() {
    if (!confirmation) return;
    const action = confirmation;
    setConfirmation(null);
    const secret = await operation.submit(action.action === "add"
      ? { action: "add", name: action.name }
      : { action: "revoke", publicKey: action.peer.publicKey, confirm: true });
    if (secret) { setConfiguration(secret); setName(""); }
    resource.refresh();
  }

  return <Page title="VPN" description="WireGuard peer snapshots and deliberate, recorded provisioning actions." refresh={refresh} loading={resource.loading || operation.working}>
    <ReadStatus {...resource} />
    {operation.error && <p role="alert" className="text-sm text-danger">{operation.error}</p>}
    <OperationStatus operation={operation.operation} checking={operation.working} check={() => { void operation.check().then(resource.refresh); }} />
    {operation.operation?.status === "completed" && !configuration && <p className="text-sm text-text-2">If you added a peer and its configuration is no longer displayed, it cannot be recovered here. Revoke that peer and deliberately provision a new one if needed.</p>}
    <p className="text-sm text-text-2">A last handshake is a timestamp, not an online indicator. Counters are reported by the interface and can reset. Server-only access must also be enforced by the host firewall.</p>
    {resource.data && <>
      <Card title={`Peers · ${resource.data.interface}`}>
        {resource.data.peers.length === 0 ? <p className="text-sm text-text-2">No WireGuard peers reported.</p> : <ul className="grid gap-4 lg:grid-cols-2">
          {resource.data.peers.map((peer) => <li key={peer.publicKey} className="min-w-0 rounded-lg border border-border-2 p-3">
            <h3 className="break-words font-medium">{peer.name || "Unnamed peer"}</h3>
            <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-text-2">Address</dt><dd className="break-all">{peer.address}</dd>
              <dt className="text-text-2">Last handshake</dt><dd>{formatTimestamp(peer.lastHandshake)}</dd>
              <dt className="text-text-2">Received</dt><dd>{formatBytes(peer.receivedBytes)}</dd>
              <dt className="text-text-2">Sent</dt><dd>{formatBytes(peer.sentBytes)}</dd>
              <dt className="text-text-2">Public key</dt><dd className="break-all">{peer.publicKey}</dd>
            </dl>
            <button type="button" className={`${buttonClass} mt-3`} disabled={operation.blocked || resource.loading}
              aria-label={`Revoke ${peer.name || "unnamed peer"}`} onClick={() => setConfirmation({ action: "revoke", peer })}>Revoke peer</button>
          </li>)}
        </ul>}
      </Card>
      <Card title="Add a peer">
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (validPeerName(name) && !operation.blocked) setConfirmation({ action: "add", name: name.trim() }); }}>
          <label htmlFor={nameId} className="text-sm font-medium">Device name</label>
          <input id={nameId} aria-describedby={helpId} aria-invalid={invalidName} className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required maxLength={64} placeholder="Personal phone" disabled={operation.blocked} autoComplete="off" />
          <p id={helpId} className="text-sm text-text-2">Use 1–64 letters, numbers, spaces, underscores, periods, or hyphens. The server allocates the address and server-specific routes. Save the private configuration when it is shown once.</p>
          <button type="submit" className={`${buttonClass} self-start`} disabled={operation.blocked || resource.loading || !validPeerName(name)}>Review new peer</button>
        </form>
      </Card>
    </>}
    {confirmation && <ConfirmDialog title={confirmation.action === "add" ? `Add ${confirmation.name}?` : `Revoke ${confirmation.peer.name || "this peer"}?`}
      confirmLabel={confirmation.action === "add" ? "Add peer" : "Revoke peer"} onCancel={() => setConfirmation(null)} onConfirm={() => { void confirm(); }}>
      {confirmation.action === "add" ? <p>Create a peer with access to the server. Its private configuration is returned once; keep this page open until it is shown.</p> : <p>This removes the peer&apos;s access and may immediately disconnect you if you are using it. Keep another LAN or recovery connection available. Revocation cannot be undone from this screen.</p>}
    </ConfirmDialog>}
    {configuration && <ProvisionConfiguration configuration={configuration} onDismiss={() => setConfiguration(null)} />}
  </Page>;
}

export default function VPNPage() {
  const { state } = useApp();
  const activePage = state.pages.find((page) => page.id === state.activePage) ?? state.pages[0];
  // The shell keeps hidden pages mounted; unmount this view to discard private keys on navigation.
  return activePage?.type === "vpn" ? <VPNControls /> : null;
}
