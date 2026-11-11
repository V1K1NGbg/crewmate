/**
 * Matches a complete start tag for `meta` or `base`, honouring quoted
 * attribute values so a `>` inside quotes cannot end the match early.
 */
const META_OR_BASE_TAG = /<(meta|base)(?=[\s/>])(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

/**
 * Removes tags that can act on the sandboxed email frame despite its CSP:
 * `<meta http-equiv>` (refresh/redirect, CSP or cookie overrides) and `<base>`
 * (re-targets every relative link). Other markup is left to the iframe
 * sandbox and Content-Security-Policy.
 */
export function neutralizeEmailHtml(html: string): string {
  return html.replace(META_OR_BASE_TAG, (tag, name: string) => {
    if (name.toLowerCase() === "base") return "";
    // Blank out quoted values so text inside an attribute cannot fake or hide the attribute name.
    const attributes = tag.replace(/"[^"]*"|'[^']*'/g, '""');
    return /[\s/]http-equiv\s*=/i.test(attributes) ? "" : tag;
  });
}
