"use client";

import { useEffect, useRef, useState } from "react";
import type { HomeMutation, HomeOperation } from "@crewmate/types";
import { canForceStop, isOperationId, operationIsUnresolved, operationWithoutSecret, readOperation, submitOperation, type MutationInput } from "./data";

export function useHomeOperation(endpoint: "/api/home/vms" | "/api/home/vpn") {
  const [operation, setOperation] = useState<HomeOperation | null>(null);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<HomeOperation | null>(null);
  const active = useRef(false);
  const locked = useRef(false);
  const request = useRef<AbortController | null>(null);
  const storageKey = `crewmate-home-operation:${endpoint}`;

  function apply(value: HomeOperation) {
    const safe = operationWithoutSecret(value);
    current.current = safe;
    setOperation(safe);
  }

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    let cancelled = false;
    void Promise.resolve().then(async () => {
      try {
        // Only a random operation identifier is persisted, never peer keys/configuration.
        const saved = sessionStorage.getItem(storageKey);
        if (isOperationId(saved)) {
          const result = await readOperation(saved, AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]));
          if (!cancelled) { current.current = result; setOperation(result); }
        }
        if (!cancelled) setReady(true);
      } catch {
        if (!cancelled) setError("Session storage is unavailable. Changes are disabled because operation recovery after a refresh cannot be guaranteed.");
      }
    });
    return () => { cancelled = true; active.current = false; controller.abort(); request.current?.abort(); };
  }, [storageKey]);

  async function submit(input: MutationInput): Promise<string | undefined> {
    const previous = current.current;
    const forceFollowUp = input.action === "destroy" && canForceStop(previous, input.id);
    if (!ready || locked.current || (operationIsUnresolved(previous) && !forceFollowUp)) return;
    locked.current = true;
    setError(null);
    let operationId: string;
    try {
      operationId = crypto.randomUUID();
      sessionStorage.setItem(storageKey, operationId);
    } catch {
      locked.current = false;
      setError("Secure operation recovery is unavailable. No change was sent. Use a trusted HTTPS connection and enable session storage.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setWorking(true);
    apply({ operationId, status: "pending", message: "Waiting for the host. Do not repeat this action." });
    const result = await submitOperation(endpoint, { ...input, operationId } as HomeMutation,
      AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]));
    locked.current = false;
    if (!active.current) return;
    if (forceFollowUp && previous && result.status === "failed") {
      apply(previous);
      setError(result.message);
      try { sessionStorage.setItem(storageKey, previous.operationId); }
      catch { setError("Force stop failed. Keep the original shutdown operation ID visible here for recovery."); }
      setWorking(false);
      return;
    }
    apply(result);
    if (result.status === "failed") {
      try { sessionStorage.removeItem(storageKey); } catch { setError("The action failed, but its saved recovery ID could not be cleared."); }
    }
    setWorking(false);
    return result.status === "completed" ? result.configuration : undefined;
  }

  async function check() {
    if (!current.current || current.current.status === "failed" || locked.current) return;
    locked.current = true;
    setWorking(true);
    const controller = new AbortController();
    request.current = controller;
    const result = await readOperation(current.current.operationId, AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]));
    locked.current = false;
    if (!active.current) return;
    apply(result);
    setWorking(false);
  }

  return { operation, working, error, blocked: !ready || working || operationIsUnresolved(operation), canForceStop: (id: string) => ready && !working && canForceStop(operation, id), submit, check };
}
