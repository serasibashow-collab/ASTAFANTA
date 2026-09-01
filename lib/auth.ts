export function usernameToEmail(username: string) {
  const normalized = username
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/g, "");

  return `${normalized}@fantacalcio.local`;
}
