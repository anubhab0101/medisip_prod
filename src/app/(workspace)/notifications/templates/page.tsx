import { T } from "@/lib/i18n/provider";
import Link from "next/link";
import { context } from "@/server/context";
import { db } from "@/server/db";
import { Permission } from "@/lib/permissions";
import { PageTitle } from "@/components/shared/page";
import { TemplateEditor } from "@/features/notifications/template-editor";
export default async function Templates() {
  const ctx = await context(Permission.MESSAGES);
  const templates = await db().notificationTemplate.findMany({
    where: { branchId: ctx.branch.id },
    orderBy: { key: "asc" },
  });
  return (
    <>
      <PageTitle
        title="Message templates"
        description="Save wording you use often. Preview before preparing a message."
        action={
          <Link href="/notifications" className="button secondary">
            <T>{"Messages"}</T>
          </Link>
        }
      />
      <details className="panel">
        <summary>
          <T>{"+ New template"}</T>
        </summary>
        <TemplateEditor shop={ctx.branch.name} />
      </details>
      {templates.map((template) => (
        <details className="panel" key={template.id}>
          <summary>
            {template.key} · {template.channel}
            <T>{!template.active ? " · Inactive" : ""}</T>
          </summary>
          <TemplateEditor
            key={JSON.stringify(template)}
            template={template}
            shop={ctx.branch.name}
          />
          {template.active && (
            <p>
              <Link
                className="button secondary"
                href={`/notifications?template=${encodeURIComponent(template.id)}&test=1`}
              >
                <T>{"Test with my contact"}</T>
              </Link>
            </p>
          )}
        </details>
      ))}
    </>
  );
}
