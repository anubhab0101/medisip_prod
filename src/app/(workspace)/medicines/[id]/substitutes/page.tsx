import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { findSubstitutes } from "@/features/stock/substitutes";
import { formatMoney } from "@/lib/money";
import { PageTitle, Empty } from "@/components/shared/page";
export default async function Substitutes({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { medicine, matches } = await findSubstitutes((await params).id);
  return (
    <>
      <PageTitle
        title={`Alternatives to ${medicine.name}`}
        description="Catalogue matches, lowest price first."
        action={
          <Link className="button secondary" href={`/medicines/${medicine.id}`}>
            <T>{"Back to medicine"}</T>
          </Link>
        }
      />
      <p className="notice">
        <T>
          {
            "Same recorded ingredient, strength, form, pack size and prescription category. A pharmacist must confirm suitability before replacing a medicine."
          }
        </T>
      </p>
      <p>
        {medicine.genericName || "Ingredient not recorded"} ·{" "}
        {medicine.strength || "Strength not recorded"} · {medicine.packSize}
      </p>
      {!matches.length ? (
        <Empty>
          <T>
            {
              "No matching alternatives with available stock. Add complete ingredient and strength details to compare medicines."
            }
          </T>
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <T>{"Medicine"}</T>
                </th>
                <th>
                  <T>{"Manufacturer"}</T>
                </th>
                <th>
                  <T>{"MRP from"}</T>
                </th>
                <th>
                  <T>{"Available"}</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link className="text-link" href={`/medicines/${m.id}`}>
                      {m.name}
                    </Link>
                  </td>
                  <td>{m.manufacturer || "—"}</td>
                  <td>{formatMoney(m.price!)}</td>
                  <td>{m.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
