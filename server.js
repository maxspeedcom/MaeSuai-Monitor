const express=require('express'),http=require('http'),https=require('https'),{Server}=require('socket.io'),Database=require('better-sqlite3'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),ping=require('ping'),net=require('net'),path=require('path'),fs=require('fs'),cron=require('node-cron'),cors=require('cors'),helmet=require('helmet'),rateLimit=require('express-rate-limit');
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:'*'}});
const PORT=process.env.PORT||3000,JWT_SECRET=process.env.JWT_SECRET||'maesuai-secret-2024',DB_PATH=process.env.DB_PATH||path.join(__dirname,'data','monitor.db');
fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});
const db=new Database(DB_PATH);
db.pragma('journal_mode=WAL');

// Auto Migration
['ALTER TABLE monitors ADD COLUMN icon TEXT DEFAULT "🖥️"',
 'ALTER TABLE monitors ADD COLUMN tags TEXT DEFAULT "[]"',
].forEach(function(sql){try{db.prepare(sql).run();}catch(e){}});









db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE NOT NULL,password TEXT NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS monitors(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,type TEXT NOT NULL,target TEXT NOT NULL,port INTEGER,interval INTEGER DEFAULT 60,timeout INTEGER DEFAULT 10,expected_status INTEGER DEFAULT 200,tags TEXT DEFAULT '[]',active INTEGER DEFAULT 1,public INTEGER DEFAULT 1,created_at DATETIME DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS heartbeats(id INTEGER PRIMARY KEY AUTOINCREMENT,monitor_id INTEGER NOT NULL,status INTEGER NOT NULL,latency INTEGER,message TEXT,checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(monitor_id) REFERENCES monitors(id) ON DELETE CASCADE);CREATE TABLE IF NOT EXISTS incidents(id INTEGER PRIMARY KEY AUTOINCREMENT,monitor_id INTEGER NOT NULL,started_at DATETIME NOT NULL,resolved_at DATETIME,message TEXT,FOREIGN KEY(monitor_id) REFERENCES monitors(id) ON DELETE CASCADE);CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);CREATE INDEX IF NOT EXISTS idx_hb ON heartbeats(monitor_id,checked_at);`);
if(!db.prepare('SELECT id FROM users WHERE username=?').get('admin')){db.prepare('INSERT INTO users(username,password) VALUES(?,?)').run('admin',bcrypt.hashSync('admin1234',10));console.log('✅ Admin: admin / admin1234');}
[['site_title','MaeSuai Cloud Monitor'],['retention_days','30'],['timezone','Asia/Bangkok']].forEach(([k,v])=>db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(k,v));
app.use(helmet({contentSecurityPolicy:false}));app.use(cors());app.use(express.json());app.use(express.static(path.join(__dirname,'public')));app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 500, validate: false }));
function auth(req,res,next){try{req.user=jwt.verify((req.headers.authorization||'').split(' ')[1],JWT_SECRET);next();}catch{res.status(401).json({error:'Unauthorized'});}}
function checkHTTP(m){return new Promise(resolve=>{const start=Date.now(),mod=m.target.startsWith('https')?https:http,req=mod.get(m.target,{timeout:m.timeout*1000},res=>{const ok=res.statusCode===(m.expected_status||200);res.resume();resolve({status:ok?1:0,latency:Date.now()-start,message:`HTTP ${res.statusCode}`});});req.on('error',e=>resolve({status:0,latency:Date.now()-start,message:e.message}));req.on('timeout',()=>{req.destroy();resolve({status:0,latency:m.timeout*1000,message:'Timeout'});});});}
async function checkPing(m){try{const r=await ping.promise.probe(m.target,{timeout:m.timeout});return{status:r.alive?1:0,latency:Math.round(r.time)||0,message:r.alive?'Alive':'No response'};}catch(e){return{status:0,latency:0,message:e.message};}}
function checkTCP(m){return new Promise(resolve=>{const start=Date.now(),sock=new net.Socket();sock.setTimeout(m.timeout*1000);sock.connect(m.port||80,m.target,()=>{sock.destroy();resolve({status:1,latency:Date.now()-start,message:'Port open'});});sock.on('error',e=>resolve({status:0,latency:Date.now()-start,message:e.message}));sock.on('timeout',()=>{sock.destroy();resolve({status:0,latency:m.timeout*1000,message:'Timeout'});});});}
async function runCheck(m){let r;try{if(m.type==='ping')r=await checkPing(m);else if(m.type==='tcp')r=await checkTCP(m);else r=await checkHTTP(m);}catch(e){r={status:0,latency:0,message:e.message};}
db.prepare('INSERT INTO heartbeats(monitor_id,status,latency,message) VALUES(?,?,?,?)').run(m.id,r.status,r.latency,r.message);
const open=db.prepare('SELECT id FROM incidents WHERE monitor_id=? AND resolved_at IS NULL').get(m.id);
if(r.status===0&&!open)db.prepare("INSERT INTO incidents(monitor_id,started_at,message) VALUES(?,datetime('now'),?)").run(m.id,r.message);
else if(r.status===1&&open)db.prepare(`UPDATE incidents SET resolved_at=datetime('now') WHERE id=?`).run(open.id);
const days=parseInt(db.prepare('SELECT value FROM settings WHERE key=?').get('retention_days')?.value||30);
db.prepare("DELETE FROM heartbeats WHERE monitor_id=? AND checked_at < datetime('now', ? || ' days')").run(m.id, '-'+days);
io.emit('heartbeat',{monitor_id:m.id,...r,checked_at:new Date().toISOString()});return r;}

// ── Telegram Notification ─────────────────────────────────
async function sendTelegram(message) {
  try {
    const token   = db.prepare('SELECT value FROM settings WHERE key=?').get('tg_token')?.value||'';
    const chat_id = db.prepare('SELECT value FROM settings WHERE key=?').get('tg_chat_id')?.value||'';
    const enabled = db.prepare('SELECT value FROM settings WHERE key=?').get('tg_enabled')?.value||'0';
    if (!token || !chat_id || enabled !== '1') return;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = JSON.stringify({ chat_id, text: message, parse_mode: 'HTML' });
    const mod = https;
    const urlObj = new URL(url);
    return new Promise((resolve) => {
      const req = mod.request({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search,
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, res => { res.resume(); resolve(); });
      req.on('error', e => { console.error('Telegram error:', e.message); resolve(); });
      req.write(body); req.end();
    });
  } catch(e) { console.error('Telegram error:', e.message); }
}

async function notifyDown(monitor, message) {
  const notifyDown = db.prepare('SELECT value FROM settings WHERE key=?').get('tg_notify_down')?.value||'1';
  if (notifyDown !== '1') return;
  const ico = monitor.icon || '🖥️';
  const msg = `🔴 <b>แจ้งเตือน: บริการล่ม!</b>\n\n${ico} <b>${monitor.name}</b>\n📡 ประเภท: ${monitor.type.toUpperCase()}\n🎯 Target: <code>${monitor.target}</code>\n❌ สาเหตุ: ${message}\n🕐 เวลา: ${new Date().toLocaleString('th-TH', {timeZone:'Asia/Bangkok'})}`;
  await sendTelegram(msg);
}

async function notifyRecover(monitor) {
  const notifyRec = db.prepare('SELECT value FROM settings WHERE key=?').get('tg_notify_recover')?.value||'1';
  if (notifyRec !== '1') return;
  const ico = monitor.icon || '🖥️';
  const msg = `✅ <b>บริการกลับมาปกติ!</b>\n\n${ico} <b>${monitor.name}</b>\n📡 ประเภท: ${monitor.type.toUpperCase()}\n🎯 Target: <code>${monitor.target}</code>\n🕐 เวลา: ${new Date().toLocaleString('th-TH', {timeZone:'Asia/Bangkok'})}`;
  await sendTelegram(msg);
}

const jobs=new Map();
function schedule(m){if(jobs.has(m.id)){jobs.get(m.id).stop();jobs.delete(m.id);}if(!m.active)return;const mins=Math.max(1,Math.ceil(m.interval/60));jobs.set(m.id,cron.schedule(`*/${mins} * * * *`,()=>runCheck(m)));}
function initScheduler(){const ms=db.prepare('SELECT * FROM monitors WHERE active=1').all();ms.forEach(m=>{schedule(m);setTimeout(()=>runCheck(m),Math.random()*3000);});console.log(`✅ Scheduler: ${ms.length} monitors`);}
app.post('/api/auth/login',(req,res)=>{const u=db.prepare('SELECT * FROM users WHERE username=?').get(req.body.username);if(!u||!bcrypt.compareSync(req.body.password,u.password))return res.status(401).json({error:'Invalid credentials'});res.json({token:jwt.sign({id:u.id,username:u.username},JWT_SECRET,{expiresIn:'7d'}),username:u.username});});
app.post('/api/auth/change-password',auth,(req,res)=>{const u=db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);if(!bcrypt.compareSync(req.body.current,u.password))return res.status(400).json({error:'Wrong password'});db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(req.body.newPassword,10),req.user.id);res.json({ok:true});});
function uptime(id,hours){const tot=db.prepare(`SELECT COUNT(*) n FROM heartbeats WHERE monitor_id=? AND checked_at>datetime('now','-'||?||' hours')`).get(id,hours);const up=db.prepare(`SELECT COUNT(*) n FROM heartbeats WHERE monitor_id=? AND status=1 AND checked_at>datetime('now','-'||?||' hours')`).get(id,hours);return tot.n?+((up.n/tot.n)*100).toFixed(2):100;}
app.get('/api/public/stats',(req,res)=>{const monitors=db.prepare('SELECT * FROM monitors WHERE public=1').all().map(m=>{const last=db.prepare('SELECT * FROM heartbeats WHERE monitor_id=? ORDER BY checked_at DESC LIMIT 1').get(m.id);const avg=db.prepare(`SELECT AVG(latency) a FROM heartbeats WHERE monitor_id=? AND checked_at>datetime('now','-1 hours')`).get(m.id);const inc=db.prepare('SELECT id FROM incidents WHERE monitor_id=? AND resolved_at IS NULL').get(m.id);return{id:m.id,name:m.name,type:m.type,target:m.target,tags:JSON.parse(m.tags||'[]'),icon:m.icon||"🖥️",status:last?.status??-1,latency:last?.latency??0,message:last?.message??'',checked_at:last?.checked_at,avgLatency:Math.round(avg?.a||0),uptime24h:uptime(m.id,24),uptime7d:uptime(m.id,168),uptime30d:uptime(m.id,720),hasIncident:!!inc};});const up=monitors.filter(m=>m.status===1).length,down=monitors.filter(m=>m.status===0).length,avg=monitors.length?(monitors.reduce((s,m)=>s+m.uptime24h,0)/monitors.length).toFixed(2):100;res.json({monitors,summary:{total:monitors.length,up,down,overallUptime:avg}});});
app.get('/api/public/monitors/:id/heartbeats',(req,res)=>{if(!db.prepare('SELECT id FROM monitors WHERE id=? AND public=1').get(req.params.id))return res.status(404).json({error:'Not found'});const h=parseInt(req.query.hours||24);res.json(db.prepare(`SELECT status,latency,message,checked_at FROM heartbeats WHERE monitor_id=? AND checked_at>datetime('now','-'||?||' hours') ORDER BY checked_at ASC`).all(req.params.id, h));});
app.get('/api/public/incidents',(req,res)=>{res.json(db.prepare('SELECT i.*,m.name monitor_name FROM incidents i JOIN monitors m ON i.monitor_id=m.id WHERE m.public=1 ORDER BY i.started_at DESC LIMIT 30').all());});
app.get('/api/monitors',auth,(req,res)=>{res.json(db.prepare('SELECT * FROM monitors ORDER BY id').all().map(m=>({...m,tags:JSON.parse(m.tags||'[]')})));});
app.post('/api/monitors',auth,(req,res)=>{const b=req.body,r=db.prepare('INSERT INTO monitors(name,type,target,port,interval,timeout,expected_status,tags,active,public,icon) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(b.name,b.type,b.target,b.port||null,b.interval||60,b.timeout||10,b.expected_status||200,JSON.stringify(b.tags||[]),b.active?1:0,b.public?1:0,b.icon||"🖥️");const m=db.prepare('SELECT * FROM monitors WHERE id=?').get(r.lastInsertRowid);schedule(m);setTimeout(()=>runCheck(m),300);res.json({...m,tags:JSON.parse(m.tags||'[]')});});
app.put('/api/monitors/:id',auth,(req,res)=>{const b=req.body;db.prepare('UPDATE monitors SET name=?,type=?,target=?,port=?,interval=?,timeout=?,expected_status=?,tags=?,active=?,public=?,icon=? WHERE id=?').run(b.name,b.type,b.target,b.port||null,b.interval||60,b.timeout||10,b.expected_status||200,JSON.stringify(b.tags||[]),b.active?1:0,b.public?1:0,b.icon||"🖥️",req.params.id);const m=db.prepare('SELECT * FROM monitors WHERE id=?').get(req.params.id);schedule(m);res.json({...m,tags:JSON.parse(m.tags||'[]')});});
app.delete('/api/monitors/:id',auth,(req,res)=>{const id=parseInt(req.params.id);if(jobs.has(id)){jobs.get(id).stop();jobs.delete(id);}db.prepare('DELETE FROM monitors WHERE id=?').run(id);res.json({ok:true});});
app.post('/api/monitors/:id/check',auth,async(req,res)=>{const m=db.prepare('SELECT * FROM monitors WHERE id=?').get(req.params.id);if(!m)return res.status(404).json({error:'Not found'});res.json(await runCheck(m));});
app.get('/api/monitors/:id/heartbeats',auth,(req,res)=>{const h=parseInt(req.query.hours||24);res.json(db.prepare(`SELECT * FROM heartbeats WHERE monitor_id=? AND checked_at>datetime('now','-'||?||' hours') ORDER BY checked_at DESC LIMIT 500`).all(req.params.id, h));});
app.get('/api/settings',auth,(req,res)=>{const s={};db.prepare('SELECT * FROM settings').all().forEach(r=>s[r.key]=r.value);res.json(s);});
app.put('/api/settings',auth,(req,res)=>{Object.entries(req.body).forEach(([k,v])=>db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(k,String(v)));res.json({ok:true});});

// ── API: Telegram ─────────────────────────────────────────
app.post('/api/telegram/test', auth, async (req,res) => {
  const {token, chat_id} = req.body;
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = JSON.stringify({chat_id, text: '✅ <b>MaeSuai Cloud Monitor</b>\n\nการเชื่อมต่อ Telegram สำเร็จ! 🎉', parse_mode:'HTML'});
    const urlObj = new URL(url);
    await new Promise((resolve, reject) => {
      const req2 = https.request({
        hostname: urlObj.hostname, path: urlObj.pathname,
        method: 'POST', headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}
      }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ const j=JSON.parse(d); j.ok?resolve(j):reject(new Error(j.description)); }); });
      req2.on('error', reject); req2.write(body); req2.end();
    });
    res.json({ok:true});
  } catch(e) { res.status(400).json({error:e.message}); }
});


// ── API: Upload Logo ──────────────────────────────────────
app.post('/api/upload-logo', auth, (req,res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'No data' });
    const buf = Buffer.from(data, 'base64');
    const fs2 = require('fs');
    fs2.mkdirSync('/opt/maeSuai-monitor/public/images', { recursive: true });
    fs2.writeFileSync('/opt/maeSuai-monitor/public/images/logo.png', buf);
    console.log('✅ Logo uploaded:', buf.length, 'bytes');
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/admin',(_,res)=>res.sendFile(path.join(__dirname,'public','admin','index.html')));
app.get('/admin/*',(_,res)=>res.sendFile(path.join(__dirname,'public','admin','index.html')));
server.listen(PORT,()=>{console.log('\n🌐 Public → http://localhost:'+PORT+'/');console.log('🔐 Admin  → http://localhost:'+PORT+'/admin\n');initScheduler();});