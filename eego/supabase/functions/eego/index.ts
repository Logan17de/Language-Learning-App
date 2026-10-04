const USER = "Mayuna";
const COOKIE = "eego_session";
const COOKIE_PATH = "/functions/v1/eego";

const te = new TextEncoder();
const td = new TextDecoder();
function b64u(bytes: Uint8Array) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}
function fromB64u(s: string) {
  s = s.replaceAll("-", "+").replaceAll("_", "/");
  while (s.length % 4) s += "=";
  const raw = atob(s); const out = new Uint8Array(raw.length);
  for (let i=0;i<raw.length;i++) out[i] = raw.charCodeAt(i); return out;
}
async function hmac(body: string) {
  const key = await crypto.subtle.importKey("raw", te.encode(SERVICE_KEY), {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", key, te.encode(body))));
}
async function makeSession() {
  const body = b64u(te.encode(JSON.stringify({user:USER, exp:Date.now()+30*86400000})));
  return `${body}.${await hmac(body)}`;
}
async function validSession(req: Request) {
  const cookie = req.headers.get("cookie") || "";
  const token = cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith(COOKIE+"="))?.slice(COOKIE.length+1);
  if (!token) return false;
  const [body,sig] = token.split("."); if (!body || !sig) return false;
  if ((await hmac(body)) !== sig) return false;
  try { const d=JSON.parse(td.decode(fromB64u(body))); return d.user===USER && d.exp>Date.now(); } catch { return false; }
}
async function sha256(s: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256",te.encode(s)))].map(x=>x.toString(16).padStart(2,"0")).join(""); }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
async function db(path:string, init:RequestInit={}) {
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...init,headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,"Content-Type":"application/json",...(init.headers||{})}});
  if(!r.ok) throw new Error(`DB ${r.status}: ${await r.text()}`);
  return r.status===204?null:r.json();
}
const json=(x:any,status=200,headers={})=>new Response(JSON.stringify(x),{status,headers:{"content-type":"application/json","cache-control":"no-store",...headers}});
const enc=(s:any)=>encodeURIComponent(String(s));
const shuffle=<T,>(a:T[])=>[...a].sort(()=>Math.random()-.5);
const cleanQuestion=(q:any)=>({id:q.id,target_kind:q.target_kind,target_key:q.target_key,cefr:q.cefr,question_type:q.question_type,prompt:q.prompt,options:q.options||[]});
const norm=(s:any)=>String(s??"").trim().toLowerCase().replace(/[.!?]+$/g,"");

async function dashboard(){
  const [mastery,attempts]=await Promise.all([
    db(`eego_mastery?user_name=eq.${enc(USER)}&select=*&order=strength.asc&limit=200`),
    db(`eego_attempts?user_name=eq.${enc(USER)}&select=*&order=created_at.desc&limit=80`)
  ]);
  const weak=(mastery||[]).filter((x:any)=>Number(x.strength)<60||x.wrong_count>x.correct_count).slice(0,30);
  const recent=(attempts||[]).slice(0,20);
  return {user:USER,stats:{total:(mastery||[]).length,mastered:(mastery||[]).filter((x:any)=>Number(x.strength)>=80).length,weak:weak.length,accuracy:recent.length?Math.round(recent.filter((x:any)=>x.is_correct).length/recent.length*100):0},weak,history:attempts||[]};
}
async function practice(kind:string,level:string,count:number){
  const n=Math.min(20,Math.max(5,Number(count)||10));
  const weak=await db(`eego_mastery?user_name=eq.${enc(USER)}&strength=lt.60&select=target_kind,target_key,cefr,strength,next_review_at&order=strength.asc&limit=30`) || [];
  const due=weak.filter((x:any)=>new Date(x.next_review_at).getTime()<=Date.now()); let qs:any[]=[];
  if(kind==="smart"&&due.length){for(const item of due.slice(0,n)){const rows=await db(`eego_questions?active=eq.true&target_key=eq.${enc(item.target_key)}&select=*&limit=3`)||[];qs.push(...shuffle(rows).slice(0,1));}}
  if(qs.length<n){const k=kind==="smart"?"":`&target_kind=eq.${enc(kind)}`;const rows=await db(`eego_questions?active=eq.true&cefr=eq.${enc(level)}${k}&select=*&limit=100`)||[];const seen=new Set(qs.map(x=>x.id));qs.push(...shuffle(rows).filter((x:any)=>!seen.has(x.id)).slice(0,n-qs.length));}
  return {questions:qs.slice(0,n).map(cleanQuestion),weakReinforced:Math.min(due.length,qs.length)};
}
async function attempt(questionId:string,answer:string,responseMs?:number){
  const qs=await db(`eego_questions?id=eq.${enc(questionId)}&select=*&limit=1`)||[];const q=qs[0];if(!q)throw new Error("Question not found");
  const accepted=[q.answer,...(Array.isArray(q.accepted_answers)?q.accepted_answers:[])].map(norm);const correct=accepted.includes(norm(answer));
  await db("eego_attempts",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({user_name:USER,question_id:q.id,target_kind:q.target_kind,target_key:q.target_key,cefr:q.cefr,submitted_answer:String(answer||""),is_correct:correct,response_ms:Number(responseMs)||null})});
  const old=(await db(`eego_mastery?user_name=eq.${enc(USER)}&target_kind=eq.${enc(q.target_kind)}&target_key=eq.${enc(q.target_key)}&select=*&limit=1`)||[])[0];
  const cc=(old?.correct_count||0)+(correct?1:0),wc=(old?.wrong_count||0)+(correct?0:1),streak=correct?(old?.current_streak||0)+1:0;let strength=Number(old?.strength||0)+(correct?Math.min(14,6+streak*2):-22);strength=Math.max(0,Math.min(100,strength));const days=correct?(strength>=80?10:strength>=60?4:1):0;
  await db("eego_mastery?on_conflict=user_name,target_kind,target_key",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({user_name:USER,target_kind:q.target_kind,target_key:q.target_key,cefr:q.cefr,correct_count:cc,wrong_count:wc,current_streak:streak,strength,next_review_at:new Date(Date.now()+days*86400000).toISOString(),last_seen_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
  return {correct,answer:q.answer,explanationJa:q.explanation_ja,strength:Math.round(strength)};
}
async function generate(kind:string,level:string,count:number){
  if(!["vocabulary","grammar"].includes(kind)||!["B1","B2","C1","C2"].includes(level))throw new Error("Invalid generation request");const n=Math.min(20,Math.max(5,Number(count)||10));
  const weak=await db(`eego_mastery?user_name=eq.${enc(USER)}&target_kind=eq.${enc(kind)}&cefr=eq.${enc(level)}&select=target_key,strength&order=strength.asc&limit=${n}`)||[];let keys=weak.slice(0,Math.ceil(n*.6)).map((x:any)=>x.target_key);
  const table=kind==="vocabulary"?"eego_vocab_targets":"eego_grammar_targets",field=kind==="vocabulary"?"term":"pattern";const targets=await db(`${table}?cefr=eq.${enc(level)}&select=${field}&limit=180`)||[];
  for(const x of shuffle(targets)){const v=x[field];if(v&&!keys.includes(v))keys.push(v);if(keys.length>=n)break;}
  const jobs=await db("eego_generation_requests",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({user_name:USER,target_kind:kind,cefr:level,target_keys:keys,requested_count:n,status:"queued"})});
  return {jobId:jobs[0].id,status:"queued",targets:keys};
}

import { appHtml } from "./app_html.ts";
import { loginHtml } from "./login_html.ts";

Deno.serve(async (req:Request)=>{
  try{
    if(req.method==="GET") return new Response(await validSession(req)?appHtml:loginHtml,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
    if(req.method!=="POST") return json({error:"Method not allowed"},405);
    const body=await req.json().catch(()=>({}));
    if(body.action==="login"){
      const cfg=await db("eego_private_config?key=eq.login_password_sha256&select=value&limit=1")||[];
      const expected=cfg[0]?.value||"";
      if(body.username!==USER || !expected || await sha256(String(body.password||""))!==expected) return json({error:"Incorrect username or password."},401);
      const token=await makeSession(); return json({ok:true},200,{"set-cookie":`${COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=${COOKIE_PATH}; Max-Age=2592000`});
    }
    if(!(await validSession(req))) return json({error:"Unauthorized"},401);
    if(body.action==="logout") return json({ok:true},200,{"set-cookie":`${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=${COOKIE_PATH}; Max-Age=0`});
    if(body.action==="dashboard") return json(await dashboard());
    if(body.action==="practice") return json(await practice(body.kind||"smart",body.level||"B1",body.count||10));
    if(body.action==="attempt") return json(await attempt(body.questionId,body.answer,body.responseMs));
    if(body.action==="generate") return json(await generate(body.kind||"vocabulary",body.level||"B1",body.count||10));
    if(body.action==="generationStatus"){const rows=await db(`eego_generation_requests?id=eq.${enc(body.id)}&user_name=eq.${enc(USER)}&select=id,status,error,completed_at&limit=1`)||[];return rows[0]?json(rows[0]):json({error:"Not found"},404)}
    return json({error:"Unknown action"},400);
  }catch(e){console.error(e);return json({error:"Something went wrong. Please try again."},500)}
});
