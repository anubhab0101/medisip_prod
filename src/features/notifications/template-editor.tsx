"use client";
import { T } from "@/lib/i18n/provider";

import { useState } from "react";
import type { NotificationTemplate } from "@prisma/client";
import { ActionForm } from "@/components/shared/action-form";
import { saveTemplateAction } from "./template-actions";
import { templateFields } from "./template-content";
import { renderTemplate } from "./content";

export function TemplateEditor({
  template,
  shop,
}: {
  template?: NotificationTemplate;
  shop: string;
}) {
  const [body, setBody] = useState(template?.body ?? "");
  const [values, setValues] = useState<Record<string, string>>({ shop });
  return (
    <ActionForm action={saveTemplateAction} label="Save template">
      <input type="hidden" name="id" value={template?.id ?? ""} />
      <div className="fields">
        <label>
          <T>{"Name"}</T>
          <input
            name="key"
            required
            maxLength={100}
            defaultValue={template?.key}
          />
        </label>
        <label>
          <T>{"Channel"}</T>
          <select name="channel" defaultValue={template?.channel ?? "SMS"}>
            <option value="SMS">SMS</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="EMAIL">
              <T>{"Email"}</T>
            </option>
          </select>
        </label>
      </div>
      <label>
        <T>{"Message"}</T>
        <textarea
          name="body"
          required
          maxLength={1200}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </label>
      <small>
        <T>{"Variables: "}</T>
        {"{name}, {shop}, {date}, {time}, {doctor}, {amount}"}
        <T>
          {
            ". The customer name and shop are filled automatically when preparing a message."
          }
        </T>
      </small>
      <div className="fields">
        {templateFields(body)
          .filter((key) => key !== "shop")
          .map((key) => (
            <label key={key}>
              <T>{"Preview "}</T>
              {key}
              <input
                maxLength={150}
                value={values[key] ?? ""}
                onChange={(event) =>
                  setValues({ ...values, [key]: event.target.value })
                }
              />
            </label>
          ))}
      </div>
      <p className="notice message-body" aria-live="polite">
        {renderTemplate(body, values) ||
          "Your message preview will appear here."}
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          name="promotional"
          defaultChecked={template?.promotional ?? false}
        />
        <T>{"Promotional (consent and sending hours apply)"}</T>
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          name="active"
          defaultChecked={template?.active ?? true}
        />
        <T>{"Available for new messages"}</T>
      </label>
      <small>
        <T>{"Saving does not send any message."}</T>
      </small>
    </ActionForm>
  );
}
