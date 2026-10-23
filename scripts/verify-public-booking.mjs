import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { isolatedPreview } from "./isolated-preview.mjs";
const test = await isolatedPreview(process.argv[2]);
const { prisma, browser, origin } = test;
let branch;
const phone = "+919999999979";
try {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: process.env.SEED_OWNER_EMAIL },
  });
  branch = await prisma.branch.create({
    data: {
      name: "Booking browser fixture",
      address: "Test address",
      phone: "",
      memberships: { create: { userId: owner.id, role: "OWNER" } },
    },
  });
  const tomorrow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + 86400000));
  const weekday = new Date(`${tomorrow}T00:00:00Z`).getUTCDay();
  const doctor = await prisma.doctor.create({
    data: {
      branchId: branch.id,
      name: "Doctor fixture",
      specialization: "General",
      feePaise: 50000,
      availability: { create: { weekday, startMinute: 540, endMinute: 1020 } },
    },
  });
  const staff = await browser.newPage();
  await staff.goto(origin + "/login");
  await staff
    .getByLabel("Email", { exact: true })
    .fill(process.env.SEED_OWNER_EMAIL);
  await staff
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_OWNER_PASSWORD);
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  await staff.waitForURL("**/dashboard");
  await staff
    .context()
    .addCookies([{ name: "medishop.branch", value: branch.id, url: origin }]);
  await staff.goto(origin + "/appointments/booking-link");
  await staff.locator('select[name="command"]').selectOption("enable");
  await staff.locator('input[name="confirmed"]').check();
  await staff.getByRole("button", { name: "Update booking link" }).click();
  await expect(
    staff.getByText("Booking link updated.", { exact: true }),
  ).toBeVisible();
  const link = await prisma.publicBookingLink.findUniqueOrThrow({
    where: { branchId: branch.id },
  });
  const results = [];
  for (const width of [1280, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 820 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `${origin}/booking/${link.token}?date=${tomorrow}&doctor=${doctor.id}`,
    );
    await expect(
      page.getByRole("heading", { name: "Book a doctor visit" }),
    ).toBeVisible();
    expect(
      await page
        .locator('.app-header,.app-nav,a[href="/login"],a[href="/dashboard"]')
        .count(),
    ).toBe(0);
    expect(
      await page.locator('meta[name="robots"]').getAttribute("content"),
    ).toContain("noindex");
    const startsAt = await page.locator('select[name="startsAt"]').inputValue();
    await page.locator('input[name="name"]').fill(`Browser visitor ${width}`);
    await page.locator('input[name="phone"]').fill(phone);
    await page.locator('input[name="confirmed"]').check();
    await page.getByRole("button", { name: "Book visit", exact: true }).click();
    await expect(
      page.getByText(
        "Booking received. Please contact the shop to confirm your visit. No payment has been taken.",
        { exact: true },
      ),
    ).toBeVisible({ timeout: 20000 });
    const booked = await prisma.appointment.findFirstOrThrow({
      where: { branchId: branch.id, startsAt: new Date(startsAt) },
    });
    expect(booked.notes).toContain("phone not verified");
    expect(
      await prisma.job.count({
        where: { payload: { path: "$.branchId", equals: branch.id } },
      }),
    ).toBe(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/public-booking-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
    results.push({
      width,
      booked: true,
      noStaffNavigation: true,
      noSms: true,
      noOverflow: true,
    });
    await page.close();
  }
  await staff.reload();
  await staff.locator('select[name="command"]').selectOption("disable");
  await staff.locator('input[name="confirmed"]').check();
  await staff.getByRole("button", { name: "Update booking link" }).click();
  await expect(
    staff.getByText("Booking link updated.", { exact: true }),
  ).toBeVisible();
  const guest = await browser.newPage();
  await guest.goto(`${origin}/booking/${link.token}`);
  await expect(
    guest.getByRole("heading", { name: "Booking link unavailable" }),
  ).toBeVisible();
  const denied = await guest.request.get(origin + "/api/reports/export");
  expect(denied.status()).toBe(401);
  await writeFile(
    ".local/public-booking-result.json",
    JSON.stringify(
      { results, disabledLinkBlocked: true, staffApiDenied: true },
      null,
      2,
    ),
  );
  console.log(
    "Public booking desktop/mobile, owner activation, disabled link and staff isolation passed.",
  );
} finally {
  if (branch) {
    await prisma.appointment.deleteMany({ where: { branchId: branch.id } });
    await prisma.doctorAvailability.deleteMany({
      where: { doctor: { branchId: branch.id } },
    });
    await prisma.doctor.deleteMany({ where: { branchId: branch.id } });
    await prisma.customer.deleteMany({ where: { branchId: branch.id } });
    await prisma.publicBookingLink.deleteMany({
      where: { branchId: branch.id },
    });
    await prisma.auditLog.deleteMany({ where: { branchId: branch.id } });
    await prisma.membership.deleteMany({ where: { branchId: branch.id } });
    await prisma.branch.delete({ where: { id: branch.id } });
    for (const scope of [branch.id, `${branch.id}:${phone}`])
      await prisma.loginAttempt.deleteMany({
        where: {
          key: createHash("sha256")
            .update(`public-booking:${scope}`)
            .digest("hex"),
        },
      });
  }
  await test.close();
}
