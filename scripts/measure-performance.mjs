import { chromium } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { writeFile } from "node:fs/promises";
process.loadEnvFile(".env.local");
const prisma=new PrismaClient(),dbTimes=[];for(let i=0;i<6;i++){const start=performance.now();await prisma.$queryRaw`SELECT 1`;if(i)dbTimes.push(Math.round(performance.now()-start));}await prisma.$disconnect();
const browser=await chromium.launch();const page=await browser.newPage();await page.goto("http://127.0.0.1:3000/login");await page.getByLabel("Email",{exact:true}).fill(process.env.SEED_OWNER_EMAIL);await page.getByLabel("Password",{exact:true}).fill(process.env.SEED_OWNER_PASSWORD);await page.getByRole("button",{name:"Sign in",exact:true}).click();await page.waitForURL("**/dashboard",{timeout:60000});
const pages={};for(const path of ["/dashboard","/stock","/billing","/medicines","/reports"]){const times=[];for(let i=0;i<3;i++){const start=performance.now();await page.goto(`http://127.0.0.1:3000${path}`);await page.locator("main h1").waitFor();times.push(Math.round(performance.now()-start));}pages[path]=times;}
await page.goto("http://127.0.0.1:3000/billing");const search=[];for(const query of ["Practice","Browser","medicine"]){const response=page.waitForResponse(r=>r.url().endsWith("/billing")&&r.request().method()==="POST");const start=performance.now();await page.getByRole("textbox",{name:/Find medicine F2/}).fill(query);await response;search.push(Math.round(performance.now()-start));}
const result={at:new Date().toISOString(),dbRoundTripMs:dbTimes,pageNavigationMs:pages,medicineSearchResponseMs:search};await writeFile(`.local/performance-${process.argv[2]??"latest"}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();
