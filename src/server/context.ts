import "server-only";
import { cache } from "react";
import type { Branch,Role } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "./db";
import { can,type PermissionName } from "@/lib/permissions";
import { BusinessError } from "@/lib/errors";
// React cache is request-scoped: layout/page share this read, but every new
// request still checks active membership and session revocation in the database.
const loadContext=cache(async()=>{
 const [session,jar]=await Promise.all([auth(),cookies()]);
 if(!session?.user?.id)redirect("/login");
 type Row=Branch&{memberRole:Role;userName:string;userEmail:string;userLocale:string};
 const rows=await db().$queryRaw<Row[]>`SELECT b.*,m.role AS memberRole,u.name AS userName,u.email AS userEmail,u.locale AS userLocale FROM User u JOIN Membership m ON m.userId=u.id JOIN Branch b ON b.id=m.branchId WHERE u.id=${session.user.id} AND u.active=1 AND u.sessionVersion=${session.user.sessionVersion} AND b.active=1 ORDER BY b.createdAt,b.id`;
 if(!rows.length)redirect("/login");
 const memberships=rows.map(row=>{const {memberRole,userName:_name,userEmail:_email,userLocale:_locale,...record}=row;void _name;void _email;void _locale;const branch:Branch={...record,active:Boolean(record.active),demo:Boolean(record.demo),loyaltyEnabled:Boolean(record.loyaltyEnabled)};return {userId:session.user.id,branchId:branch.id,role:memberRole,branch};});
 const member=memberships.find(m=>m.branchId===jar.get("medishop.branch")?.value)??memberships[0];
 return {user:{id:session.user.id,name:rows[0].userName,email:rows[0].userEmail,locale:rows[0].userLocale},role:member.role,branch:member.branch,memberships};
});
export async function context(permission?:PermissionName){const ctx=await loadContext();if(permission&&!can(ctx.role,permission))throw new BusinessError("You do not have permission to do that. Ask the owner for help.");return ctx;}
export type AppContext=Awaited<ReturnType<typeof context>>;
