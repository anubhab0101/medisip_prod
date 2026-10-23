export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false,
    endedQuote = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          endedQuote = true;
        }
      } else cell += c;
    } else if (c === '"' && !cell && !endedQuote) quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
      endedQuote = false;
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      endedQuote = false;
    } else {
      if (endedQuote || c === '"')
        throw new Error("Check quotes and commas in the CSV file.");
      cell += c;
    }
  }
  if (quoted) throw new Error("A quoted CSV cell is not closed.");
  if (cell || row.length || endedQuote) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}
export function toCsv(rows: (string | number)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let cell = String(value);
            if (typeof value === "string" && /^[\s]*[=+@-]/.test(cell))
              cell = "'" + cell;
            return `"${cell.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}
