// Local-only convenience runner. Test-container credentials never enter logs.
const {execFileSync,spawnSync}=require('node:child_process')
const data=JSON.parse(execFileSync('docker',['inspect','nomenu-ci-backend-pg17-clean'],{encoding:'utf8'}))[0]
const env=Object.fromEntries(data.Config.Env.map(e=>{const i=e.indexOf('=');return[e.slice(0,i),e.slice(i+1)]}))
const port=data.HostConfig.PortBindings['5432/tcp'][0]
if(port.HostIp!=='127.0.0.1'||port.HostPort!=='55433')throw new Error('Expected isolated local PostgreSQL')
const uri=`postgres://${encodeURIComponent(env.POSTGRES_USER)}:${encodeURIComponent(env.POSTGRES_PASSWORD)}@127.0.0.1:55433/nomenu_ci_test`
const result=spawnSync(process.execPath,['--test','test/admin-report-integration.test.js'],{cwd:require('node:path').resolve(__dirname,'..'),env:{...process.env,CI_TEST_DATABASE_URL:uri},stdio:'inherit'})
process.exitCode=result.status??1
