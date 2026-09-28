export const TEST_API_TOKEN = process.env.AEGIS_API_TOKEN || "phase6-test-token";

export function authHeaders(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${TEST_API_TOKEN}`,
    ...extra,
  };
}

export async function authFetch(path: string, init: RequestInit = {}) {
  return fetch(`http://localhost:3000${path}`, {
    ...init,
    headers: authHeaders(init.headers as Record<string, string> | undefined),
  });
}
