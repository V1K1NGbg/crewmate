"use client";

import { useCallback, useEffect, useState } from "react";
import { responseData } from "./data";

export function useHomeResource<T>(url: string, decode: (value: unknown) => T) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ url: string; revision: number; data: T | null; error: string | null; updatedAt: string } | null>(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("The request timed out.")), 15_000);
    let active = true;
    fetch(url, { signal: controller.signal, cache: "no-store", headers: { Accept: "application/json" } })
      .then(responseData).then(decode)
      .then((data) => {
        if (active) setResult({ url, revision, data, error: null, updatedAt: new Date().toISOString() });
      })
      .catch((error: unknown) => {
        if (active) setResult({ url, revision, data: null, error: error instanceof Error ? error.message : "Unable to reach the server.", updatedAt: "" });
      })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [url, decode, revision]);

  return {
    data: result?.url === url ? result.data : null,
    error: result?.url === url && result.revision === revision ? result.error : null,
    loading: !result || result.url !== url || result.revision !== revision,
    updatedAt: result?.url === url ? result.updatedAt : "",
    refresh,
  };
}
