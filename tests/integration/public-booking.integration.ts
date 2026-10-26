import { beforeAll, afterAll, it, expect } from "vitest";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  requestPublicBooking,
  publicBookingInfo,
} from "../../src/features/public-booking/service";
import { shopDate } from "../../src/lib/date";
import { db } from "../../src/server/db";
import { consumeLoginAttempt } from "../../src/features/auth/rate-limit";
const prisma = new PrismaClient();
const date = shopDate(new Date(Date.now() + 86400000));
const token = randomBytes(32).toString("base64url");
const loginEmail = `${randomUUID()}@example.invalid`;
const branchIds: string[] = [],
  doctorIds: string[] = [],
  phoneScopes = new Set<string>();
let branchId = "",
  doctorId = "",
  otherDoctorId = "";
const start = (hour: number, minute = 0) =>
  new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`,
  ).toISOString();
function input(hour: number, phone = "+919999991101") {
  phoneScopes.add(`${branchId}:${phone}`);
  return {
    token,
    doctorId,
    operationId: randomUUID(),
    name: "Public test visitor",
    phone,
    startsAt: start(hour),
    confirmed: true,
  };
}
beforeAll(async () => {
  if (
    !/^\/medishop_restore_\d+$/.test(
      new URL(process.env.DATABASE_URL ?? "").pathname,
    )
  )
    throw new Error("Requires isolated restore database.");
  for (let i = 0; i < 2; i++) {
    const branch = await prisma.branch.create({
      data: {
        name: "Public booking isolated verification",
        address: "Test",
        phone: "",
      },
    });
    branchIds.push(branch.id);
    const doctor = await prisma.doctor.create({
      data: {
        branchId: branch.id,
        name: "Test doctor",
        specialization: "Test",
        feePaise: 10000,
        slotMinutes: 15,
        availability: {
          create: {
            weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
            startMinute: 8 * 60,
            endMinute: 20 * 60,
          },
        },
      },
    });
    doctorIds.push(doctor.id);
  }
  [branchId] = branchIds;
  [doctorId, otherDoctorId] = doctorIds;
  await prisma.publicBookingLink.create({
    data: { branchId, token, active: true },
  });
});
afterAll(async () => {
  await prisma.appointment.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  await prisma.auditLog.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.customer.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.doctorAvailability.deleteMany({
    where: { doctorId: { in: doctorIds } },
  });
  await prisma.doctor.deleteMany({ where: { id: { in: doctorIds } } });
  await prisma.publicBookingLink.deleteMany({
    where: { branchId: { in: branchIds } },
  });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
  const scopes = [branchId, ...phoneScopes];
  await prisma.loginAttempt.deleteMany({
    where: {
      key: {
        in: scopes.map((s) =>
          createHash("sha256").update(`public-booking:${s}`).digest("hex"),
        ),
      },
    },
  });
  await prisma.loginAttempt.deleteMany({
    where: { key: createHash("sha256").update(loginEmail).digest("hex") },
  });
  await prisma.$disconnect();
  await db().$disconnect();
});
it("requires confirmation and scopes doctors to active non-practice booking links", async () => {
  const data = input(8);
  await expect(
    requestPublicBooking({ ...data, confirmed: false }),
  ).rejects.toThrow();
  await expect(
    requestPublicBooking({ ...data, doctorId: otherDoctorId }),
  ).rejects.toThrow("doctor");
  const info = await publicBookingInfo(token, date);
  expect(info?.doctors.map((d) => d.id)).toEqual([doctorId]);
  await prisma.publicBookingLink.update({
    where: { branchId },
    data: { active: false },
  });
  await expect(requestPublicBooking(data)).rejects.toThrow("unavailable");
  expect(await publicBookingInfo(token, date)).toBeNull();
  await prisma.publicBookingLink.update({
    where: { branchId },
    data: { active: true },
  });
  await prisma.branch.update({ where: { id: branchId }, data: { demo: true } });
  await expect(requestPublicBooking(data)).rejects.toThrow("unavailable");
  expect(await publicBookingInfo(token, date)).toBeNull();
  await prisma.branch.update({
    where: { id: branchId },
    data: { demo: false },
  });
});
it("only one concurrent booking takes a slot; same operation retries return one record and changed payload rejects", async () => {
  const first = input(9, "+919999991102"),
    second = input(9, "+919999991103");
  const result = await Promise.allSettled([
    requestPublicBooking(first),
    requestPublicBooking(second),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const winner = result[0].status === "fulfilled" ? first : second;
  const resultId = (
    result.find(
      (r) => r.status === "fulfilled",
    ) as PromiseFulfilledResult<string>
  ).value;
  expect(await requestPublicBooking(winner)).toBe(resultId);
  await expect(
    requestPublicBooking({ ...winner, name: "Changed visitor" }),
  ).rejects.toThrow("changed");
  expect(
    await prisma.appointment.count({
      where: { branchId, startsAt: new Date(first.startsAt) },
    }),
  ).toBe(1);
  const identical = input(10, "+919999991104");
  const ids = await Promise.all([
    requestPublicBooking(identical),
    requestPublicBooking(identical),
  ]);
  expect(ids[0]).toBe(ids[1]);
});
it("keeps existing customer identity and consent untouched and never schedules SMS", async () => {
  const phone = "+919999991105";
  const customer = await prisma.customer.create({
    data: {
      branchId,
      name: "Existing verified profile",
      phone,
      consentSms: true,
      consentWhatsapp: true,
      consentEmail: true,
      email: "existing@example.invalid",
    },
  });
  await requestPublicBooking(input(11, phone));
  const saved = await prisma.customer.findUniqueOrThrow({
    where: { id: customer.id },
  });
  expect(saved.name).toBe(customer.name);
  expect(saved.email).toBe(customer.email);
  expect([saved.consentSms, saved.consentWhatsapp, saved.consentEmail]).toEqual(
    [true, true, true],
  );
  const fresh = input(12, "+919999991106");
  await requestPublicBooking(fresh);
  const newCustomer = await prisma.customer.findUniqueOrThrow({
    where: { branchId_phone: { branchId, phone: fresh.phone } },
  });
  expect([
    newCustomer.consentSms,
    newCustomer.consentWhatsapp,
    newCustomer.consentEmail,
  ]).toEqual([false, false, false]);
  const appointments = await prisma.appointment.findMany({
    where: { branchId },
    select: { id: true },
  });
  for (const appointment of appointments)
    expect(
      await prisma.job.count({
        where: { key: { endsWith: `:${appointment.id}` } },
      }),
    ).toBe(0);
});
it("caps new requests from one phone at five per hour", async () => {
  const phone = "+919999991107";
  const first = input(13, phone);
  const firstId = await requestPublicBooking(first);
  for (let i = 1; i < 5; i++) await requestPublicBooking(input(13 + i, phone));
  await expect(requestPublicBooking(input(18, phone))).rejects.toThrow(
    "Too many booking attempts",
  );
  expect(
    await prisma.appointment.count({
      where: {
        branchId,
        customerId: (
          await prisma.customer.findUniqueOrThrow({
            where: { branchId_phone: { branchId, phone } },
          })
        ).id,
      },
    }),
  ).toBe(5);
  expect(await requestPublicBooking(first)).toBe(firstId);
});
it("concurrent first login attempts share one throttle row without lost counts", async () => {
  const testIp = "192.168.1.100";
  const first = await Promise.all([
    consumeLoginAttempt(loginEmail, testIp),
    consumeLoginAttempt(loginEmail, testIp),
  ]);
  expect(first).toEqual([true, true]);
  const key = createHash("sha256").update(`${loginEmail}:${testIp}`).digest("hex");
  expect(
    (await prisma.loginAttempt.findUniqueOrThrow({ where: { key } })).attempts,
  ).toBe(2);
  for (let i = 0; i < 8; i++)
    expect(await consumeLoginAttempt(loginEmail, testIp)).toBe(true);
  expect(await consumeLoginAttempt(loginEmail, testIp)).toBe(false);
  expect(
    (await prisma.loginAttempt.findUniqueOrThrow({ where: { key } })).attempts,
  ).toBe(10);
});
