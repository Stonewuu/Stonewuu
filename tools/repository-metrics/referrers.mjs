export function publicSourceName(name) {
  let host;
  try {
    host = new URL(name.includes("://") ? name : "https://" + name).hostname.toLowerCase().replace(/^\[|\]$/g,"");
  } catch {
    return name;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1" ||
      (host.includes(":") && /^(?:f[cd]|fe[89ab])/.test(host))) {
    return "内网来源";
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return name;
  }
  const [a,b] = host.split(".").map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 169 && b === 254) ? "内网来源" : name;
}
