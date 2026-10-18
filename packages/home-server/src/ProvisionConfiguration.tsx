"use client";

import { useEffect, useId, useRef, useState } from "react";
import QRCode from "qrcode";
import { buttonClass } from "./ui";

export default function ProvisionConfiguration({ configuration, onDismiss }: { configuration: string; onDismiss: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const [qrError, setQrError] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const canvas = canvasRef.current;
    const link = downloadRef.current;
    const url = URL.createObjectURL(new Blob([configuration], { type: "text/plain;charset=utf-8" }));
    if (link) link.href = url;
    dialog?.showModal();
    let active = true;
    if (canvas) void QRCode.toCanvas(canvas, configuration, { width: 256, margin: 4, errorCorrectionLevel: "M" })
      .catch(() => { if (active) setQrError(true); });
    return () => {
      active = false;
      dialog?.close();
      URL.revokeObjectURL(url);
      if (link) link.removeAttribute("href");
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    };
  }, [configuration]);

  return <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={onDismiss}
    onKeyDown={(event) => event.stopPropagation()}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-auto rounded-xl border border-border-2 bg-surface p-5 text-text backdrop:bg-black/60">
    <h2 id={titleId} className="text-lg font-semibold">Save this WireGuard configuration now</h2>
    <p id={descriptionId} className="my-3 text-sm text-text-2">This configuration and QR code contain a private key. They are available only in this view and cannot be retrieved from operation history. Closing, navigating away, or refreshing clears them. Store the download securely; if lost, revoke the peer and provision a new one.</p>
    {qrError ? <p role="status" className="text-sm">QR generation failed. Download the configuration instead.</p> : <canvas ref={canvasRef} role="img" aria-label="Private WireGuard configuration QR code; a configuration download is also available" className="mx-auto max-w-full" />}
    <div className="mt-4 flex flex-wrap gap-3">
      <a ref={downloadRef} download="crewmate-wireguard.conf" className={buttonClass}>Download configuration</a>
      <button type="button" autoFocus className={buttonClass} onClick={onDismiss}>Dismiss and clear</button>
    </div>
  </dialog>;
}
