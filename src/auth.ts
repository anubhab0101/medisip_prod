import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { db } from "@/server/db";
import {
  consumeLoginAttempt,
  clearLoginAttempts,
} from "@/features/auth/rate-limit";
const credentialsSchema = z.object({
  email: z
    .string()
    .email()
    .max(191)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(72),
  ip: z.string().max(45).optional(),
});
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
        ip: { type: "text" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success || !process.env.DATABASE_URL) return null;
        const { email, password, ip = "unknown" } = parsed.data;
        if (!(await consumeLoginAttempt(email, ip))) return null;
        const user = await db().user.findUnique({ where: { email } });
        // Constant-time comparison: always hash, never early-return on missing user
        const valid = user?.active && (await compare(password, user.passwordHash));
        if (!valid) {
          await clearLoginAttempts(email, ip);
          return null;
        }
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.sessionVersion = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.sessionVersion = Number(token.sessionVersion ?? 0);
      }
      return session;
    },
  },
});
