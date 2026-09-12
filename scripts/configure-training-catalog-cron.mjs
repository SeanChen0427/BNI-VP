// Set up the application schedule, not a Codex reminder. Requires linked Supabase CLI access.
// Usage: SUPABASE_CLI_PATH=/path/to/supabase.js node scripts/configure-training-catalog-cron.mjs --apply
import {execFileSync} from "node:child_process";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {randomBytes} from "node:crypto";
if(!process.argv.includes("--apply"))throw new Error("Explicit --apply required to configure the daily application schedule");
const cli=process.env.SUPABASE_CLI_PATH;
if(!cli)throw new Error("Provide SUPABASE_CLI_PATH");
const project=(await readFile("supabase/.temp/project-ref","utf8")).trim();
if(!/^[a-z]{20}$/.test(project))throw new Error("Invalid linked project reference");
const temp=await mkdtemp(path.join(tmpdir(),"training-cron-"));
const run=args=>execFileSync(process.execPath,[cli,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:120000});
try{
  const secret=randomBytes(32).toString("hex");
  const envPath=path.join(temp,"edge.env"),sqlPath=path.join(temp,"schedule.sql");
  await writeFile(envPath,`TRAINING_CATALOG_CRON_SECRET=${secret}\n`,{mode:0o600});
  run(["secrets","set","--project-ref",project,"--env-file",envPath]);
  // Names and values are generated locally and strictly bounded; no user SQL is accepted.
  const url=`https://${project}.supabase.co/functions/v1/training-catalog-cron`;
  await writeFile(sqlPath,`begin;
do $config$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name='training_catalog_cron_secret';
  if v_id is null then perform vault.create_secret('${secret}','training_catalog_cron_secret');
  else perform vault.update_secret(v_id,'${secret}'); end if;
  select id into v_id from vault.secrets where name='training_catalog_cron_url';
  if v_id is null then perform vault.create_secret('${url}','training_catalog_cron_url');
  else perform vault.update_secret(v_id,'${url}'); end if;
end $config$;
select cron.schedule('training-catalog-daily','0 22 * * *','select private.invoke_training_catalog_sync()');
commit;
`,{mode:0o600});
  run(["db","query","--linked","--file",sqlPath]);
  console.log("課表專用密鑰與每日台北時間 06:00 排程已設定；密鑰不輸出。");
}catch{
  throw new Error("課表排程設定失敗，請核對 CLI 連線與函式部署狀態；未輸出密鑰或原始錯誤內容。");
}finally{await rm(temp,{recursive:true,force:true});}
