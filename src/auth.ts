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
});
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success || !process.env.DATABASE_URL) return null;
        const { email, password } = parsed.data;
        if (!(await consumeLoginAttempt(email))) return null;
        const user = await db().user.findUnique({ where: { email } });
        // Compare even unknown accounts to avoid a fast account-enumeration path.
        const valid = await compare(
          password,
          user?.passwordHash ??
            "$2b$12$NQ2LvNmTHSSQaLiQUCpR4e/AywjHtghV0NLjWCduDNnhRPNwujm6y",
        );
        if (!user?.active || !valid) return null;
        await clearLoginAttempts(email);
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
