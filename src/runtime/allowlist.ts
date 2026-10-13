const HOSTS = new Set(["api.frankfurter.dev", "api.open-meteo.com"]);

export function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** Templates are filled later; sample them so the host can be checked up front. */
export function templateUrlAllowed(url: string): boolean {
  return isAllowedUrl(url.replace(/\{\{[^}]+\}\}/g, "1"));
}
