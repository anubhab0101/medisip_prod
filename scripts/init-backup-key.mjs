import { randomBytes } from "node:crypto";
import { readFile,appendFile } from "node:fs/promises";
const file=".env.local";const text=await readFile(file,"utf8");if(!/^BACKUP_KEY=/m.test(text)){await appendFile(file,`\nBACKUP_KEY=${randomBytes(32).toString("base64")}\n`);console.log("Backup encryption key generated in the ignored local environment.");}else console.log("Backup key already exists.");
