export function parseCheckbox(formData: FormData, key: string) {
  const value: unknown = formData.get(key);
  return value === true || value === "on" || value === "true" || value === "1";
}
