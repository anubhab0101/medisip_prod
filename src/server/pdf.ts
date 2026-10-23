import "server-only";
import path from "node:path";
import pdfmake from "pdfmake";
import type {
  Content,
  ContentTable,
  ContentText,
  TDocumentDefinitions,
} from "pdfmake/interfaces";

const directory = path.join(process.cwd(), "assets", "fonts");
for (const family of ["NotoSans", "NotoSansDevanagari", "NotoSansOriya"]) {
  pdfmake.addFonts({
    [family]: {
      normal: path.join(directory, `${family}-Regular.ttf`),
      bold: path.join(directory, `${family}-Bold.ttf`),
      italics: path.join(directory, `${family}-Regular.ttf`),
      bolditalics: path.join(directory, `${family}-Bold.ttf`),
    },
  });
}
// Documents contain plain saved text, never remote resources or caller-supplied PDF definitions.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy(
  (file) => path.dirname(path.resolve(file)) === directory,
);

export function pdfText(
  value: string | number,
  options: Omit<ContentText, "text"> = {},
): ContentText {
  const runs: { text: string; font: string }[] = [];
  for (const character of String(value)) {
    const code = character.codePointAt(0)!;
    const font =
      code >= 0x0900 && code <= 0x097f
        ? "NotoSansDevanagari"
        : code >= 0x0b00 && code <= 0x0b7f
          ? "NotoSansOriya"
          : /[\u200c\u200d]/u.test(character)
            ? (runs.at(-1)?.font ?? "NotoSans")
            : "NotoSans";
    const previous = runs.at(-1);
    if (previous?.font === font) previous.text += character;
    else runs.push({ text: character, font });
  }
  return { ...options, text: runs };
}

export function pdfTable(
  headers: string[],
  rows: (string | number)[][],
  widths?: (string | number)[],
): ContentTable {
  return {
    layout: "lightHorizontalLines",
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: widths ?? headers.map(() => "*"),
      body: [
        headers.map((h) =>
          pdfText(h, {
            bold: true,
            fillColor: "#eef2f4",
            margin: [0, 5, 0, 5],
          }),
        ),
        ...rows.map((row) =>
          row.map((cell) => pdfText(cell, { margin: [0, 4, 0, 4] })),
        ),
      ],
    },
  };
}

export async function renderPdf(
  title: string,
  content: Content[],
  landscape = false,
) {
  const definition: TDocumentDefinitions = {
    info: { title, creator: "MediShop", producer: "MediShop" },
    pageSize: "A4",
    pageOrientation: landscape ? "landscape" : "portrait",
    pageMargins: [32, 32, 32, 40],
    defaultStyle: {
      font: "NotoSans",
      fontSize: 9,
      color: "#17202a",
      lineHeight: 1.15,
    },
    content,
    footer: (current, count) =>
      pdfText(`Page ${current} of ${count}`, {
        alignment: "right",
        margin: [32, 12, 32, 0],
        fontSize: 8,
        color: "#52606d",
      }),
  };
  return pdfmake.createPdf(definition).getBuffer();
}

export function pdfResponse(buffer: Buffer, filename: string) {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^a-zA-Z0-9_.-]/g, "_")}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
