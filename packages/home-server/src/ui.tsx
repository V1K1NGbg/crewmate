"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import type { HomeOperation } from "@crewmate/types";
import { formatTimestamp, operationIsUnresolved } from "./data";

export const buttonClass = "min-h-11 rounded-lg border border-border-2 bg-surface px-4 py-2 text-sm text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";
export const inputClass = "min-h-11 w-full min-w-0 rounded-lg border border-border-2 bg-bg px-3 py-2 text-text focus-visible:outline-2 focus-visible:outline-accent";

export function Page({ title, description, children, refresh, loading = false }: {
  title: string; description: string; children: ReactNode; refresh?: () => void; loading?: boolean;
}) {
  return (
    <section aria-label={title} className="min-w-0 flex-1 overflow-y-auto bg-bg p-4 text-text sm:p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><h1 className="text-xl font-semibold">{title}</h1><p className="mt-1 text-sm text-text-2">{description}</p></div>
          {refresh && <button type="button" className={buttonClass} onClick={refresh} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>}
        </header>
        {children}
      </div>
    </section>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-border bg-surface p-4"><h2 className="mb-3 font-medium">{title}</h2>{children}</section>;
}

export function ReadStatus({ loading, error, updatedAt }: { loading: boolean; error: string | null; updatedAt?: string }) {
  return <>
    {loading && <p role="status" className="text-sm text-text-2">Loading current server data…</p>}
    {error && <p role="alert" className="rounded-lg border border-danger p-3 text-sm text-text">{error} Use Refresh to try the read again.</p>}
    {!loading && !error && updatedAt && <p className="text-xs text-text-2">Last fetched {formatTimestamp(updatedAt)}. Values are a snapshot, not a live connection check.</p>}
  </>;
}

export function OperationStatus({ operation, checking, check }: { operation: HomeOperation | null; checking: boolean; check: () => void }) {
  if (!operation) return null;
  return (
    <div className="rounded-lg border border-border-2 bg-surface p-4">
      <div role="status" className="break-words text-sm">
        <p className="font-medium">Operation: {operation.status}</p><p>{operation.message}</p>
        <p className="mt-2 break-all text-xs text-text-2">ID: {operation.operationId}</p>
        {operationIsUnresolved(operation) && <p className="mt-2">{operation.forceStopVM ? "Graceful shutdown was acknowledged. Refresh its status, or explicitly confirm Force stop for that VM if the guest does not stop." : "The outcome is not confirmed. Further changes are blocked; check the recorded operation instead of submitting it again."}</p>}
      </div>
      {operationIsUnresolved(operation) && <button type="button" className={`${buttonClass} mt-3`} disabled={checking} onClick={check}>{checking ? "Checking…" : "Check recorded operation"}</button>}
    </div>
  );
}

export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} aria-labelledby={titleId} aria-describedby={descriptionId} onCancel={onCancel}
      onKeyDown={(event) => event.stopPropagation()}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-auto rounded-xl border border-border-2 bg-surface p-5 text-text backdrop:bg-black/60">
      <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
      <div id={descriptionId} className="my-4 break-words text-sm text-text-2">{children}</div>
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" autoFocus className={buttonClass} onClick={onCancel}>Cancel</button>
        <button type="button" className={buttonClass} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </dialog>
  );
}
