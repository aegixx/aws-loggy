/**
 * Checks if an error message indicates an AWS connection or credential issue.
 * Used by both log fetching and live tail to detect session expiry, network errors, etc.
 */
export function isConnectionOrCredentialError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("expired") ||
    lower.includes("sso") ||
    lower.includes("token") ||
    lower.includes("credential") ||
    lower.includes("connection") ||
    lower.includes("connector") ||
    lower.includes("network") ||
    lower.includes("timeout") ||
    lower.includes("unable to connect")
  );
}
