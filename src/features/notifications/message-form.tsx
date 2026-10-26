"use client";
import { LocalizedInput } from "@/lib/i18n/controls";

import { T } from "@/lib/i18n/provider";

import { useState, useRef } from "react";
import Link from "next/link";
import { prepareMessageForForm } from "./actions";
import type { NotificationTemplate } from "@prisma/client";
import { renderTemplate } from "./content";
import { templateFields } from "./template-content";
export function MessageForm({
  customers,
  templates,
  shop,
  initialTemplateId = "",
  testMode = false,
}: {
  customers: { id: string; name: string; phone: string }[];
  templates: NotificationTemplate[];
  shop: string;
  initialTemplateId?: string;
  testMode?: boolean;
}) {
  const initial = templates.find((item) => item.id === initialTemplateId);
  const [templateId, setTemplateId] = useState(initial?.id ?? "");
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");
  const [channel, setChannel] = useState<string>(initial?.channel ?? "SMS");
  const [body, setBody] = useState("");
  const [promotional, setPromotional] = useState(initial?.promotional ?? false);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const template = templates.find((item) => item.id === templateId);
  const preview = template
    ? renderTemplate(template.body, {
        ...variables,
        name: customers.find((item) => item.id === customerId)?.name ?? "",
        shop,
      })
    : body;
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const operation = useRef(crypto.randomUUID());
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    setUrl("");
    setSuccess("");
    try {
      const result = await prepareMessageForForm({
        customerId: form.get("customerId"),
        channel: form.get("channel"),
        body: form.get("body"),
        promotional: form.get("promotional") === "on",
        operationId: operation.current,
        templateId,
        variables,
        testMode,
        ownPhone: String(form.get("ownPhone") ?? ""),
        ownRecipientConfirmed: form.get("ownRecipientConfirmed") === "on",
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setUrl(result.url);
      setSuccess(
        result.queued
          ? channel === "WHATSAPP"
            ? "WhatsApp message queued. Check its status below."
            : "SMS queued. Delivery status will update after the worker sends it."
          : "Ready. Open the message and send it yourself.",
      );
      operation.current = crypto.randomUUID();
    } catch {
      setError(
        "Could not prepare this message. Check customer consent, shop mode and sending hours.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="stack"
      onChange={() => {
        setUrl("");
        setSuccess("");
      }}
    >
      <fieldset disabled={pending}>
        {testMode && (
          <div className="notice">
            <strong>
              <T>{"Test a saved template"}</T>
            </strong>
            <p>
              <T>
                {
                  "Choose your own saved customer record with consent for this channel. Enter your own number for SMS/WhatsApp; email tests must match your staff sign-in email. Preparing a test queues SMS, and queues WhatsApp when Evolution Go is enabled; otherwise WhatsApp and email open for you to send manually."
                }
              </T>
            </p>
            <p>
              <T>{"No personal contact record yet?"}</T>{" "}
              <Link className="text-link" href="/customers">
                <T>{"Add your own contact and consent first"}</T>
              </Link>
              <T>{". SMS tests expire after 15 minutes."}</T>
            </p>
          </div>
        )}
        <label>
          <T>{"Template"}</T>
          <select
            value={templateId}
            onChange={(event) => {
              setTemplateId(event.target.value);
              const selected = templates.find(
                (item) => item.id === event.target.value,
              );
              if (selected) {
                setChannel(selected.channel);
                setPromotional(selected.promotional);
              }
              setVariables({});
              setUrl("");
              setSuccess("");
            }}
          >
            <option value="">
              <T>{"Write your own"}</T>
            </option>
            {templates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.key} · {item.channel}
              </option>
            ))}
          </select>
        </label>
        {testMode && (
          <>
            {channel !== "EMAIL" && (
              <label>
                <T>{"My phone number"}</T>
                <LocalizedInput
                  name="ownPhone"
                  type="tel"
                  required
                  maxLength={30}
                  placeholder="Your own mobile number"
                />
              </label>
            )}
            <label className="checkbox">
              <input name="ownRecipientConfirmed" type="checkbox" required />
              <T>
                {
                  "This is my own contact record, and I agree to receive this test."
                }
              </T>
            </label>
          </>
        )}
        <div className="fields">
          <label>
            <T>{"Customer"}</T>
            <select
              name="customerId"
              required
              value={customerId}
              onChange={(event) => setCustomerId(event.target.value)}
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.phone}
                </option>
              ))}
            </select>
          </label>
          <label>
            <T>{"Channel"}</T>
            <select
              name="channel"
              value={channel}
              onChange={(event) => {
                setChannel(event.target.value);
                setTemplateId("");
              }}
            >
              <option value="SMS">SMS</option>
              <option value="WHATSAPP">
                <T>{"WhatsApp — send manually"}</T>
              </option>
              <option value="EMAIL">
                <T>{"Email — send manually"}</T>
              </option>
            </select>
          </label>
        </div>
        {template && (
          <div className="fields">
            {templateFields(template.body)
              .filter((key) => !["name", "shop"].includes(key))
              .map((key) => (
                <label key={key}>
                  {key}
                  <input
                    required
                    maxLength={150}
                    value={variables[key] ?? ""}
                    onChange={(event) =>
                      setVariables({ ...variables, [key]: event.target.value })
                    }
                  />
                </label>
              ))}
          </div>
        )}
        <label>
          <T>{"Message"}</T>
          <textarea
            name="body"
            required
            maxLength={1200}
            value={preview}
            readOnly={!!template}
            onChange={(event) => setBody(event.target.value)}
          />
          <small>
            <T>{"Your shop name is added automatically."}</T>
          </small>
        </label>
        <label className="checkbox">
          <input
            name="promotional"
            type="checkbox"
            checked={promotional || !!template?.promotional}
            onChange={(event) => setPromotional(event.target.checked)}
            disabled={template?.promotional}
          />
          <T>{"Promotional message (8 AM–9 PM only)"}</T>
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="success">
          {success}
        </p>
      )}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="button secondary"
        >
          <T>{"Open message to send"}</T>
        </a>
      )}
      <button className="button" disabled={pending || !customers.length}>
        {pending
          ? "Preparing…"
          : testMode
            ? "Prepare test message"
            : "Prepare message"}
      </button>
    </form>
  );
}
