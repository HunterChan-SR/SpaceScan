export function csvCell(value: string | number): string {
  let text = String(value);
  // Avoid spreadsheet formula evaluation when a filename is opened in Excel/Sheets.
  if (typeof value === "string" && /^[\s]*[=+@-]/u.test(text))
    text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
