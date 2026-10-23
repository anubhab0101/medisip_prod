import { T } from "@/lib/i18n/provider";
import { PageTitle, Empty } from "@/components/shared/page";
import { PrintButton } from "@/components/shared/print-button";
import { getReport } from "@/features/reports/service";
import { reportKinds, reportLabels } from "@/features/reports/schema";
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const report = await getReport(await searchParams);
  const query = new URLSearchParams({
    kind: report.kind,
    from: report.from,
    to: report.to,
  });
  return (
    <>
      <PageTitle title="Reports" description={report.shop} />
      <form className="toolbar no-print">
        <label>
          <T>{"Report"}</T>
          <select name="kind" defaultValue={report.kind}>
            {reportKinds.map((k) => (
              <option key={k} value={k}>
                {reportLabels[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <T>{"From"}</T>
          <input type="date" name="from" defaultValue={report.from} required />
        </label>
        <label>
          <T>{"To"}</T>
          <input type="date" name="to" defaultValue={report.to} required />
        </label>
        <button className="button secondary">
          <T>{"Show"}</T>
        </button>
        <a
          className="button secondary"
          download
          href={`/api/reports/export?${query}`}
        >
          <T>{"Download CSV"}</T>
        </a>
        <PrintButton />
        <a
          className="button secondary"
          download
          href={`/api/reports/pdf?${query}`}
        >
          <T>{"Download PDF"}</T>
        </a>
      </form>
      <h2>
        {report.title} - {report.from}
        <T>{" to "}</T>
        {report.to}
      </h2>
      <p>{report.note}</p>
      {!report.rows.length ? (
        <Empty>
          <T>{"No records for this report."}</T>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {report.headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p>
        {report.rows.length}
        <T>{" rows"}</T>
      </p>
    </>
  );
}
