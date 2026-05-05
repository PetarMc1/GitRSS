function parseRequiredString(
  rawValue: string | undefined,
  envName: string,
): string {
  const value = rawValue?.trim();
  if (!value) {
    throw new Error(`${envName} is required.`);
  }

  return value;
}

export const apiBase = parseRequiredString(
  import.meta.env.VITE_API_URL,
  "VITE_API_URL",
);

export const ADMIN_STORAGE_KEY = parseRequiredString(
  import.meta.env.VITE_ADMIN_STORAGE_KEY,
  "VITE_ADMIN_STORAGE_KEY",
);
