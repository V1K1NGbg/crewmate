import type { Page } from "@crewmate/types";

export type CustomPageInput = Omit<Page, "keybinding" | "type"> & {
  type: "custom";
};

export function normalizeCustomPageUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/** Prefer official iframe-compatible variants without proxying private content. */
export function toEmbeddableCustomPageUrl(value: string): string {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (hostname === "google.com" || hostname === "www.google.com") {
      if (url.pathname === "/") url.pathname = "/webhp";
      url.searchParams.set("igu", "1");
    }
    if (hostname === "docs.google.com") {
      if (/^\/document\/d\/[^/]+\/(edit|view)/.test(url.pathname)) {
        url.pathname = url.pathname.replace(/\/(edit|view).*$/, "/preview");
      } else if (/^\/spreadsheets\/d\/[^/]+\/(edit|view)/.test(url.pathname)) {
        url.pathname = url.pathname.replace(/\/(edit|view).*$/, "/preview");
      } else if (/^\/presentation\/d\/[^/]+\/(edit|view)/.test(url.pathname)) {
        url.pathname = url.pathname.replace(/\/(edit|view).*$/, "/embed");
      }
    }
    if (
      hostname === "drive.google.com" &&
      /^\/file\/d\/[^/]+\/(view|edit)/.test(url.pathname)
    ) {
      url.pathname = url.pathname.replace(/\/(view|edit).*$/, "/preview");
    }
    return url.toString();
  } catch {
    return value;
  }
}

export function appendCustomPage(
  pages: Page[],
  page: Omit<Page, "keybinding">,
): Page[] {
  const url = page.url ? normalizeCustomPageUrl(page.url) : null;
  if (page.type !== "custom" || !page.label.trim() || !url) return pages;

  return [
    ...pages,
    {
      ...page,
      label: page.label.trim(),
      url,
      keybinding: String(pages.length + 1),
    },
  ];
}

export function updateCustomPage(
  pages: Page[],
  pageId: string,
  updates: Pick<Page, "label" | "url">,
): Page[] {
  const url = updates.url ? normalizeCustomPageUrl(updates.url) : null;
  if (!updates.label.trim() || !url) return pages;
  let changed = false;
  const next = pages.map((page) => {
    if (page.id !== pageId || page.type !== "custom") return page;
    changed = true;
    return { ...page, label: updates.label.trim(), url };
  });
  return changed ? next : pages;
}
