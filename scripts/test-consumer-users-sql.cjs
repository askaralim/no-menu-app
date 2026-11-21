// Isolated PostgreSQL only; synthetic account data, no production credentials.
const {execFileSync}=require('node:child_process')
const {randomUUID,createHash}=require('node:crypto')
const {readFileSync}=require('node:fs')
const assert=require('node:assert/strict')
const pg=require('../services/consumer-intelligence/node_modules/pg')
async function main(){
 const config=JSON.parse(execFileSync('docker',['inspect','nomenu-ci-backend-pg17-clean'],{encoding:'utf8'}))[0]
 const vars=Object.fromEntries(config.Config.Env.map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]))
 const port=config.HostConfig.PortBindings['5432/tcp'][0]
 assert.equal(port.HostIp,'127.0.0.1');assert.equal(port.HostPort,'55433')
 const options={host:'127.0.0.1',port:55433,user:vars.POSTGRES_USER,password:vars.POSTGRES_PASSWORD,database:'nomenu_ci_test'}
 const admin=new pg.Client(options);await admin.connect()
 const database='nomenu_ci_test_users_'+randomUUID().replaceAll('-','')
 await admin.query(`CREATE DATABASE "${database}"`);await admin.end()
 const c=new pg.Client({...options,database});await c.connect()
 try{
 await c.query(`CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.admin',true)='yes' $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,created_at timestamptz);
 CREATE TABLE auth.identities(user_id uuid,provider text);
 CREATE TABLE user_roles(user_id uuid);
 CREATE TABLE consumer_wechat_identities(user_id uuid,created_at timestamptz,last_login_at timestamptz);
 CREATE TABLE user_profiles(user_id uuid,consumer_username text,consumer_username_is_default boolean,consumer_username_normalized text);
 CREATE TABLE user_drink_lights(id uuid,user_id uuid,product_id uuid,provisional_drink_id uuid,created_at timestamptz,last_activity_at timestamptz);
 CREATE TABLE user_bar_follows(user_id uuid,tenant_id uuid,created_at timestamptz);
 CREATE TABLE tenants(id uuid,name text,display_name text);
 CREATE TABLE drink_products(id uuid,name text,beer_style text);
 CREATE TABLE drinks(id uuid,name text);`)
 const sql=readFileSync('supabase/migrations/20261120083241_consumer_admin_account_semantics.sql','utf8')
 await c.query(sql);await c.query(sql)
 const user=randomUUID(),wechat=randomUUID(),role=randomUUID(),unused=randomUUID(),tenant=randomUUID(),product=randomUUID()
 for(const id of [user,wechat,role,unused])await c.query("INSERT INTO auth.users VALUES($1,'2026-11-01Z')",[id])
 await c.query('INSERT INTO user_roles VALUES($1)',[role])
 await c.query("INSERT INTO consumer_wechat_identities VALUES($1,'2026-11-10Z','2026-11-19Z'),($2,'2026-11-10Z','2026-11-19Z')",[wechat,role])
 await c.query("INSERT INTO tenants VALUES($1,'Test bar',NULL);",[tenant])
 await c.query("INSERT INTO drink_products VALUES($1,'Test beer','Lager')",[product])
 for(const id of [user,wechat])await c.query("INSERT INTO user_drink_lights VALUES($1,$2,$3,NULL,'2026-11-05Z','2026-11-05Z')",[randomUUID(),id,product])
 await c.query("INSERT INTO user_bar_follows VALUES($1,$2,'2026-11-05Z')",[user,tenant])
 const ref=createHash('sha256').update(user).digest('hex').slice(0,16)
 await assert.rejects(c.query('SELECT admin_list_consumer_users()'))
 await c.query("SELECT set_config('test.uid',$1,false),set_config('test.admin','no',false)",[randomUUID()])
 await assert.rejects(c.query('SELECT admin_get_consumer_user_detail($1)',[ref]))
 await c.query("SELECT set_config('test.admin','yes',false)")
 const report=(await c.query('SELECT admin_list_consumer_users() AS value')).rows[0].value
 assert.equal(report.users.length,2);assert.equal(report.summary.unbound_consumers,1)
 assert.equal(report.users.find(x=>x.source==='wechat').activated_within_24h,false)
 assert.equal(report.users.find(x=>x.source==='wechat').registered_at.startsWith('2026-11-01'),true)
 assert.equal(report.users.find(x=>x.source==='wechat').wechat_linked_at.startsWith('2026-11-10'),true)
 const details=(await c.query('SELECT admin_get_consumer_user_detail($1) AS value',[ref])).rows[0].value
 assert.equal((await c.query('SELECT admin_resolve_consumer_ref($1) AS id',[ref])).rows[0].id,user)
 assert.equal(details.taps[0].name,'Test beer');assert.equal(details.follows[0].name,'Test bar')
 assert.equal((await c.query('SELECT admin_get_consumer_user_detail($1,20) AS value',[ref])).rows[0].value.taps.length,0)
 assert.ok(!JSON.stringify(details).includes(user))
 await assert.rejects(c.query('SELECT admin_get_consumer_user_detail($1,-1)',[ref]))
 await assert.rejects(c.query('SELECT admin_get_consumer_user_detail($1)',[createHash('sha256').update(role).digest('hex').slice(0,16)]))
 console.log('PASS: migration repeat, anonymous/admin authorization, consumer scope, account dates, activation bounds, details, pagination, no user UUID exposure')
 }finally{await c.end()}
}
main().catch(e=>{console.error(e.message);process.exitCode=1})
