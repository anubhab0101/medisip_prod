import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { readFile,writeFile,access } from "node:fs/promises";
process.loadEnvFile(".env.local");
try{await access(".env.migration.local");console.log("Restricted app account already configured; migration environment exists.");process.exit(0);}catch{}
const adminUrl=new URL(process.env.DATABASE_URL),database=adminUrl.pathname.slice(1);
if(!/^medishop_dev_[a-z0-9_]+$/.test(database))throw new Error("Account setup is restricted to the inspected development database.");
const user=`${decodeURIComponent(adminUrl.username).split(".")[0]}.app${randomBytes(4).toString("hex")}`,password=randomBytes(32).toString("base64url");
if(!/^[A-Za-z0-9.]+$/.test(user))throw new Error("Unexpected account name.");
const prisma=new PrismaClient();try{await prisma.$executeRawUnsafe(`CREATE USER '${user}'@'%' IDENTIFIED BY '${password}'`);await prisma.$executeRawUnsafe(`GRANT SELECT,INSERT,UPDATE,DELETE ON \`${database}\`.* TO '${user}'@'%'`);}finally{await prisma.$disconnect();}
const appUrl=new URL(adminUrl);appUrl.username=user;appUrl.password=password;
const app=new PrismaClient({datasourceUrl:appUrl.toString()});try{await app.branch.count();const grants=await app.$queryRawUnsafe("SHOW GRANTS FOR CURRENT_USER");const values=JSON.stringify(grants);if(/ALL PRIVILEGES|GRANT OPTION|CREATE USER/i.test(values))throw new Error("Unexpected excess database privileges.");}finally{await app.$disconnect();}
await writeFile(".env.migration.local",`MIGRATION_DATABASE_URL=${JSON.stringify(adminUrl.toString())}\n`,{flag:"wx",mode:0o600});
const env=await readFile(".env.local","utf8");await writeFile(".env.local",env.replace(/^DATABASE_URL=.*$/m,`DATABASE_URL=${JSON.stringify(appUrl.toString())}`));
console.log("Runtime account verified with data-only privileges on the application database. Administrative credential isolated for migrations.");
