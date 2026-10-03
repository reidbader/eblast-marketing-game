const CFG=window.EBLAST_CONFIG;
const SCOPES="https://www.googleapis.com/auth/spreadsheets";
let tokenClient,accessToken=null,headers=[],rows=[],activeRow=null,view="inbox",period="daily";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const map=()=>Object.fromEntries(headers.map((h,i)=>[h,i]));
const val=(r,n)=>{const i=map()[n];return i==null?"":(r.values[i]??"")};
const setVal=(r,n,v)=>{const i=map()[n];if(i!=null)r.values[i]=v};
const date=s=>{const d=new Date(s);return isNaN(d)?null:d};
function score(r){const x=Number(val(r,"Marketing Score"));if(x>0)return x;return Math.max(0,Math.min(100,({High:55,Medium:35,Low:15}[val(r,"AI Importance")]||10)+(Number(val(r,"Reid Rank"))||0)*5+({Ready:20,Shortlist:12,Candidate:5,Skip:-50}[val(r,"Marketing Status")]||0)))}
function starts(){
 const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),week=new Date(today),month=new Date(now.getFullYear(),now.getMonth(),1);
 week.setDate(week.getDate()-((week.getDay()+6)%7));
 return {today,week,month};
}
function progress(){
 const {today,week,month}=starts(),todayKey=today.toISOString().slice(0,10);
 const reviewed=rows.map(r=>date(val(r,"Reviewed Date"))).filter(Boolean);
 const daily=rows.filter(r=>val(r,"Reviewed Date").slice(0,10)===todayKey).length;
 const weekly=reviewed.filter(d=>d>=week).length;
 const monthly=reviewed.filter(d=>d>=month).length;
 $("daily").textContent=daily;$("weekly").textContent=weekly;$("monthly").textContent=monthly;
 $("missionText").textContent=daily>=CFG.goals.daily?"Daily goal complete":"Review "+Math.max(0,CFG.goals.daily-daily)+" more new marketing blast"+(CFG.goals.daily-daily===1?"":"s");
 $("missionBar").style.width=Math.min(100,(daily/CFG.goals.daily)*100)+"%";
}
function options(id,field){
 const el=$(id),cur=el.value,items=[...new Set(rows.map(r=>val(r,field)).filter(Boolean))].sort();
 el.innerHTML='<option value="">All '+field.toLowerCase()+'s</option>'+items.map(x=>'<option>'+esc(x)+'</option>').join("");
 el.value=cur;
}
function filtered(){
 const q=$("q").value.toLowerCase().trim(),fs=[["Destination","destination"],["Activity","activity"],["Traveler Type","traveler"],["Deal Type","deal"]];
 return rows.filter(r=>{
  if(q && !["Subject","Sender","Summary","Region","Category","Destination","Activity","Traveler Type","Deal Type","Marketing Angle","Reid Tags"].map(k=>val(r,k)).join(" ").toLowerCase().includes(q)) return false;
  return fs.every(([f,id])=>!$(id).value||val(r,f)===$(id).value);
 });
}
function inPeriod(r,p){
 const {today,week,month}=starts();
 const rd=date(val(r,"Reviewed Date"))||date(val(r,"Received"));
 if(!rd)return false;
 if(p==="daily")return rd>=today;
 if(p==="weekly")return rd>=week;
 return rd>=month;
}
function list(){
 let a=filtered();
 if(view==="ready") return a.filter(r=>["Ready","Published"].includes(val(r,"Marketing Status"))).sort((a,b)=>score(b)-score(a));
 if(view==="top10") return a.filter(r=>val(r,"Status")!=="Ignore"&&val(r,"Marketing Status")!=="Skip"&&inPeriod(r,period)).sort((a,b)=>score(b)-score(a)).slice(0,10);
 return a.filter(r=>val(r,"Status")==="New"&&val(r,"Marketing Status")!=="Skip").sort((a,b)=>(date(val(b,"Received"))?.getTime()||0)-(date(val(a,"Received"))?.getTime()||0)).slice(0,10);
}
function cardChips(r){
 const items=[
  [val(r,"AI Importance"),val(r,"AI Importance")==="High"?"high":""],
  [val(r,"Category"),""],[val(r,"Region"),""],[val(r,"Destination"),""],[val(r,"Activity"),""],[val(r,"Traveler Type"),""],[val(r,"Deal Type"),""],
  [val(r,"Validity")&&val(r,"Validity")!=="Not stated"?val(r,"Validity"):"","valid"],
  [val(r,"Marketing Status"),""]
 ];
 return items.filter(x=>x[0]).map(([x,c])=>'<span class="chip '+c+'">'+esc(x)+'</span>').join("");
}
function render(){
 progress();
 $("periodTabs").classList.toggle("hidden",view!=="top10");
 const a=list();
 $("status").textContent=accessToken?(view==="inbox"?a.length+" of 10 items in today's queue":a.length+" items"):"Connect Google to load the sheet.";
 $("cards").innerHTML=a.length?a.map((r,i)=>'<article class="card" data-row="'+r.sheetRow+'">'+(view==="inbox"?'<div class="queue-label">Queue '+(i+1)+' of '+a.length+'</div>':'')+'<div class="card-top"><div>'+(view==="top10"?'<span class="rank">'+(i+1)+'</span>':'')+'<small>'+esc(val(r,"Sender"))+'</small><h3>'+esc(val(r,"Subject"))+'</h3></div><div class="score">'+score(r)+'</div></div><p>'+esc(val(r,"Summary")).slice(0,250)+'</p><div class="chips">'+cardChips(r)+'</div></article>').join(""):'<div class="empty">'+(view==="inbox"?"No new items in the queue.":"No items match this view.")+'</div>';
 document.querySelectorAll(".card").forEach(c=>c.onclick=()=>openEditor(Number(c.dataset.row)));
}
function openEditor(row){
 activeRow=rows.find(r=>r.sheetRow===row);if(!activeRow)return;
 $("sender").textContent=val(activeRow,"Sender");$("subject").textContent=val(activeRow,"Subject");$("summary").textContent=val(activeRow,"Summary");$("why").textContent=val(activeRow,"Why It Matters");$("validity").textContent=val(activeRow,"Validity")&&val(activeRow,"Validity")!=="Not stated"?"Validity: "+val(activeRow,"Validity"):"";
 $("detailMeta").innerHTML=cardChips(activeRow);
 $("source").href=val(activeRow,"Source Email")||"#";
 [["fDestination","Destination"],["fActivity","Activity"],["fTraveler","Traveler Type"],["fDeal","Deal Type"],["fRank","Reid Rank"],["fScore","Marketing Score"],["fMStatus","Marketing Status"],["fStatus","Status"],["fAngle","Marketing Angle"],["fTags","Reid Tags"],["fNotes","Notes"]].forEach(([id,f])=>$(id).value=val(activeRow,f));
 $("editor").showModal();
}
function col(n){let s="";while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
async function save(mode){
 if(!activeRow||!accessToken)return;
 const now=new Date().toISOString(),u={
  "Destination":$("fDestination").value.trim(),"Activity":$("fActivity").value.trim(),"Traveler Type":$("fTraveler").value.trim(),"Deal Type":$("fDeal").value.trim(),
  "Reid Rank":$("fRank").value,"Marketing Score":$("fScore").value,"Marketing Status":$("fMStatus").value,"Status":$("fStatus").value,
  "Marketing Angle":$("fAngle").value.trim(),"Reid Tags":$("fTags").value.trim(),"Notes":$("fNotes").value.trim(),"Reviewed Date":val(activeRow,"Reviewed Date")||now
 };
 if(mode==="skip"){u["Marketing Status"]="Skip";u["Status"]="Ignore"}
 if(mode==="promote"){u["Marketing Status"]="Shortlist";u["Status"]="Action";if(!$("fScore").value)u["Marketing Score"]=String(Math.max(70,score(activeRow)))}
 if(mode==="save"&&u["Status"]==="New")u["Status"]="Reviewed";
 if(u["Marketing Status"]==="Published"&&!val(activeRow,"Published Date"))u["Published Date"]=now;
 const m=map(),data=Object.entries(u).filter(([k])=>m[k]!=null).map(([k,v])=>({range:"'"+CFG.sheetName.replaceAll("'","''")+"'!"+col(m[k]+1)+activeRow.sheetRow,values:[[v]]}));
 const resp=await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(CFG.spreadsheetId)+"/values:batchUpdate",{method:"POST",headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},body:JSON.stringify({valueInputOption:"RAW",data})});
 if(!resp.ok){alert("Save failed: "+await resp.text());return}
 Object.entries(u).forEach(([k,v])=>setVal(activeRow,k,v));
 ["destination","activity","traveler","deal"].forEach((id,j)=>options(id,["Destination","Activity","Traveler Type","Deal Type"][j]));
 $("editor").close();render();
 const next=list()[0];if(view==="inbox"&&next)openEditor(next.sheetRow);
}
async function load(){
 const range=encodeURIComponent("'"+CFG.sheetName+"'!A1:X2000"),resp=await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(CFG.spreadsheetId)+"/values/"+range+"?majorDimension=ROWS",{headers:{Authorization:"Bearer "+accessToken}});
 if(!resp.ok){$("status").textContent="Could not read the sheet.";return}
 const p=await resp.json(),v=p.values||[];headers=v[0]||[];rows=v.slice(1).filter(r=>r.some(Boolean)).map((x,i)=>({sheetRow:i+2,values:[...x]}));rows.forEach(r=>{while(r.values.length<headers.length)r.values.push("")});
 options("destination","Destination");options("activity","Activity");options("traveler","Traveler Type");options("deal","Deal Type");render();
}
function auth(){
 if(CFG.googleClientId.includes("PASTE_")){alert("Google OAuth still needs to be configured in config.js.");return}
 if(!tokenClient)tokenClient=google.accounts.oauth2.initTokenClient({client_id:CFG.googleClientId,scope:SCOPES,callback:r=>{if(r.error)return alert(r.error);accessToken=r.access_token;$("auth").textContent="Google connected";load()}});
 tokenClient.requestAccessToken({prompt:accessToken?"":"consent"});
}
$("auth").onclick=auth;
["q","destination","activity","traveler","deal"].forEach(id=>$(id).addEventListener(id==="q"?"input":"change",render));
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");view=b.dataset.view;render()});
document.querySelectorAll(".period").forEach(b=>b.onclick=()=>{document.querySelectorAll(".period").forEach(x=>x.classList.remove("active"));b.classList.add("active");period=b.dataset.period;render()});
$("save").onclick=()=>save("save");$("skip").onclick=()=>save("skip");$("promote").onclick=()=>save("promote");render();