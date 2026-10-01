// Isolated PostgreSQL regression. Never connects to production.
// PGLITE_MODULE_PATH=/absolute/path/to/pglite/dist/index.js node scripts/verify-feedback-closure-sql.mjs
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
if(!process.env.PGLITE_MODULE_PATH)throw new Error('Provide PGLITE_MODULE_PATH for isolated SQL validation');
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE_PATH).href);
const db=new PGlite();
const read=name=>readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
const definition=(sql,name)=>{const start=sql.indexOf(`create or replace function ${name}(`);assert.ok(start>=0,name);return sql.slice(start,sql.indexOf('$$;',start)+3);};
const uuid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
let checks=0;
try{
 await db.exec(`
 create role authenticated; create role service_role;
 create schema private; create schema auth;
 create type public.app_role as enum ('admin','vp','committee','chair');
 create table people(id uuid primary key,display_name text,status text);
 create table app_accounts(auth_user_id uuid primary key,role app_role,enabled boolean);
 create table committee_terms(person_id uuid,role text,status text,has_voting_right boolean,starts_on date,ends_on date);
 create table members(id uuid primary key,person_id uuid);
 create table cases(id uuid primary key,type text,stage text,member_id uuid,applicant_name_snapshot text,completed_at timestamptz,updated_by uuid);
 create table tasks(id uuid primary key,case_id uuid,category text,status text,completed_at timestamptz,completed_by uuid,revision bigint,lead_person_id uuid);
 create table task_case_states(task_id uuid primary key,workflow jsonb,draft jsonb,revision bigint,updated_by uuid);
 create table vote_snapshots(id uuid primary key,case_id uuid,status text,deadline_at timestamptz,closed_at timestamptz);
 create table case_feedback(id uuid primary key,case_id uuid,author_person_id uuid,body text,submitted_at timestamptz default now(),updated_at timestamptz default now(),locked_at timestamptz,submitted_by_person_id uuid);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 `);
 const initial=await read('20260720070454_initial_schema');
 for(const name of ['private.current_app_role','private.is_active_committee_person','private.has_role','private.set_updated_at','private.validate_feedback_write','private.protect_case_closure'])await db.exec(definition(initial,name));
 await db.exec(`create trigger case_feedback_updated_at before update on case_feedback for each row execute function private.set_updated_at();
 create trigger case_feedback_validate before insert or update on case_feedback for each row execute function private.validate_feedback_write();
 create trigger protect_case_closure before update on cases for each row execute function private.protect_case_closure();`);
 await db.exec(await read('20260804014500_fix_case_feedback_lock_order'));
 await db.exec(definition(await read('20260811010000_record_only_case_closure'),'public.edge_save_case_state_as_user'));
 await db.exec(`revoke all on function public.edge_save_case_state_as_user(uuid,uuid,uuid,jsonb,jsonb,bigint,timestamptz) from public; grant execute on function public.edge_save_case_state_as_user(uuid,uuid,uuid,jsonb,jsonb,bigint,timestamptz) to service_role;`);
 for(const [n,role,name] of [[1,'vp','新副主席'],[2,'committee','卸任委員'],[3,'committee','留任委員'],[4,'admin','系統開發人員 Admin'],[5,'chair','其他角色']]){
  await db.query('insert into people values ($1,$2,\'active\')',[uuid(n),name]);
  await db.query('insert into app_accounts values ($1,$2,true)',[uuid(n+100),role]);
  if(['vp','committee'].includes(role))await db.query("insert into committee_terms values ($1,$2,'active',true,current_date-365,current_date+365)",[uuid(n),role]);
 }
 async function seed(n){
  await db.query("insert into cases(id,type,stage,applicant_name_snapshot) values ($1,'renewal','advisor','受訪會員')",[uuid(n)]);
  await db.query("insert into tasks values ($1,$1,'renewal','pending',null,null,1,$2)",[uuid(n),uuid(1)]);
  await db.query(`insert into task_case_states values ($1,'{"closed":false,"advisorStatus":"confirmed","resultAnnouncementSent":true}','{}',1,$2)`,[uuid(n),uuid(1)]);
  await db.query("insert into vote_snapshots values ($1,$1,'open',now()-interval '1 day',null)",[uuid(n)]);
  await db.query("insert into case_feedback(id,case_id,author_person_id,body,submitted_by_person_id) values ($1,$1,$2,'原回饋內容',$3)",[uuid(n),uuid(2),uuid(3)]);
 }
 for(let n=10;n<25;n++)await seed(n);
 await db.query("update committee_terms set status='ended',ends_on=current_date-1 where person_id=$1",[uuid(2)]);
 const close=(n,actor=1,revision=1)=>db.query(`select edge_save_case_state_as_user($1,$2,$3,'{"closed":true,"advisorStatus":"confirmed","resultAnnouncementSent":true}','{}',$4,null)`,[uuid(n),uuid(actor),uuid(actor+100),revision]);
 const row=async n=>(await db.query('select to_jsonb(f) as value from case_feedback f where id=$1',[uuid(n)])).rows[0].value;
 await assert.rejects(close(10),/回饋者不是當期有效投票成員/);checks++;
 assert.equal((await db.query('select revision from task_case_states where task_id=$1',[uuid(10)])).rows[0].revision,1);checks++;
 assert.equal((await row(10)).locked_at,null);checks++;
 console.log('Reproduced: prior closure fails for retired feedback author and rolls back.');
 const fix=await read('20261001090000_fix_historical_feedback_closure');
 await db.exec(fix);await db.exec(fix);
 const before=await row(10);await close(10);const after=await row(10);
 assert.ok(after.locked_at);assert.deepEqual({...after,locked_at:null,updated_at:before.updated_at},before);checks++;
 assert.equal((await db.query('select stage from cases where id=$1',[uuid(10)])).rows[0].stage,'closed');checks++;
 assert.equal((await db.query('select status from tasks where id=$1',[uuid(10)])).rows[0].status,'completed');checks++;
 assert.equal((await db.query('select status from vote_snapshots where id=$1',[uuid(10)])).rows[0].status,'closed');checks++;
 await close(11,4);assert.ok((await row(11)).locked_at);checks++;
 await assert.rejects(close(12,3),/只有副主席或 Admin 可結案/);checks++;
 await assert.rejects(close(12,2),/登入人員不具當期角色/);checks++;
 await assert.rejects(close(12,5),/只有副主席或 Admin 可結案/);checks++;
 await assert.rejects(close(12,1,0),/CASE_CONFLICT/);checks++;
 async function identity(n){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?uuid(n+100):'']);}
 for(const n of [3,5,0]){await identity(n);await assert.rejects(db.query('update case_feedback set locked_at=now() where id=$1',[uuid(12)]),/只有副主席或 Admin 可原樣鎖定/);checks++;}
 await identity(1);
 for(const mutation of ["body='changed'","submitted_by_person_id=null","submitted_at=now()+interval '1 day'","id='00000000-0000-0000-0000-000000000099'"]){
  await assert.rejects(db.query(`update case_feedback set locked_at=now(),${mutation} where id=$1`,[uuid(12)]),/只有副主席或 Admin 可原樣鎖定/);checks++;
 }
 for(const mutation of [`case_id='${uuid(13)}'`,`author_person_id='${uuid(3)}'`]){await assert.rejects(db.query(`update case_feedback set locked_at=now(),${mutation} where id=$1`,[uuid(12)]),/不得變更既有回饋的案件或作者/);checks++;}
 await assert.rejects(db.query("update case_feedback set body='changed' where id=$1",[uuid(12)]),/回饋者不是當期有效投票成員/);checks++;
 await assert.rejects(db.query("insert into case_feedback(id,case_id,author_person_id,body) values ($1,$2,$3,'new')",[uuid(90),uuid(12),uuid(2)]),/回饋者不是當期有效投票成員/);checks++;
 await db.query('update case_feedback set locked_at=now() where id=$1',[uuid(12)]);
 for(const mutation of ["body='changed'",'locked_at=null','locked_at=now()']){await assert.rejects(db.query(`update case_feedback set ${mutation} where id=$1`,[uuid(12)]),/結案或鎖定後不得修改回饋/);checks++;}
 await assert.rejects(db.query('update case_feedback set locked_at=null where id=$1',[uuid(10)]),/結案或鎖定後不得修改回饋/);checks++;
 await db.query("insert into case_feedback(id,case_id,author_person_id,body) values ($1,$2,$3,'current')",[uuid(91),uuid(13),uuid(3)]);checks++;
 await db.query("update case_feedback set body='current updated' where id=$1",[uuid(91)]);checks++;
 await db.query("update cases set applicant_name_snapshot='留任委員' where id=$1",[uuid(14)]);
 await assert.rejects(db.query("insert into case_feedback(id,case_id,author_person_id,body) values ($1,$2,$3,'recused')",[uuid(92),uuid(14),uuid(3)]),/申請者本人必須迴避/);checks++;
 await db.exec('set role authenticated');await assert.rejects(close(13),/permission denied/);await db.exec('reset role');checks++;
 console.log(`PASS ${checks} isolated PostgreSQL checks: historical closure, rollback, unchanged feedback attribution, leadership guard, edit/insert eligibility, recusal, locked/closed immutability and RPC access.`);
}finally{await db.close();}
