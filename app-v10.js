const CFG=window.EBLAST_CONFIG;
const SCOPES="https://www.googleapis.com/auth/spreadsheets";
let tokenClient,accessToken=null,headers=[],rows=[],activeRow=null,view="inbox",period="daily";
let actionHistory=[],rapidRows=[],rapidIndex=0,compareRows=[],comparePair=[];
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const map=()=>Object.fromEntries(headers.map((h,i)=>[h,i]));
const val=(r,n)=>{const i=map()[n];return i==null?"":(r.values[i]??"")};
const setVal=(r,n,v)=>{const i=map()[n];if(i!=null)r.values[i]=v};
const date=s=>{const d=new Date(s);return isNaN(d)?null:d};

function inferredDate(monthName,day,year,received){
  const months={jan:0,january:0,feb:1,february:1,mar:2,march:2,apr:3,april:3,may:4,jun:5,june:5,jul:6,july:6,aug:7,august:7,sep:8,sept:8,september:8,oct:9,october:9,nov:10,november:10,dec:11,december:11};
  const m=months[String(monthName).toLowerCase()];
  if(m==null)return null;
  let y=year?Number(year):(received?received.getFullYear():new Date().getFullYear());
  let d=new Date(y,m,Number(day),23,59,59,999);
  if(!year&&received&&d<received){d=new Date(y+1,m,Number(day),23,59,59,999);}
  return d;
}
function validityExpiry(r){
  const text=String(val(r,"Validity")||"").trim();
  if(!text||/^not stated$/i.test(text))return null;
  const received=date(val(r,"Received"));
  const month="(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
  const datePart=month+"\\s+(\\d{1,2})(?:,?\\s+(20\\d{2}))?";
  const deadlinePatterns=[
    new RegExp("(?:offer\\s+expires?|book(?:ing|ings)?(?:\\s+must\\s+be\\s+confirmed)?|book|purchase|valid)\\s*(?:by|through|until|to|on)?\\s*.{0,45}?"+datePart,"i"),
    new RegExp("(?:confirmed|reserve|reserved)\\s+by\\s*.{0,30}?"+datePart,"i")
  ];
  for(const re of deadlinePatterns){
    const m=text.match(re);
    if(m){
      const d=inferredDate(m[m.length-3],m[m.length-2],m[m.length-1],received);
      if(d)return d;
    }
  }
  if(/end of (?:the )?year/i.test(text)){
    const y=(text.match(/20\d{2}/)||[])[0]||String(received?received.getFullYear():new Date().getFullYear());
    return new Date(Number(y),11,31,23,59,59,999);
  }
  const matches=[...text.matchAll(new RegExp(datePart,"gi"))];
  const dates=matches.map(m=>inferredDate(m[1],m[2],m[3],received)).filter(Boolean);
  return dates.length?new Date(Math.max(...dates.map(d=>d.getTime()))):null;
}
function isExpired(r){
  const exp=validityExpiry(r);
  if(!exp)return false;
  const now=new Date();const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  return exp<today;
}
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
function selectedMulti(containerId){
 const el=$(containerId);
 return [...el.querySelectorAll('input[type="checkbox"]:checked')].map(x=>x.value);
}
function buildMulti(containerId,summaryId,field){
 const box=$(containerId),vals=[...new Set(rows.map(r=>val(r,field)).filter(Boolean))].sort();
 box.innerHTML=vals.map(v=>'<label class="multi-option"><input type="checkbox" value="'+esc(v)+'"><span>'+esc(v)+'</span></label>').join("");
 box.querySelectorAll('input').forEach(x=>x.addEventListener("change",()=>{
   const chosen=selectedMulti(containerId);
   $(summaryId).textContent=chosen.length?chosen.length+" selected":"All "+field.toLowerCase()+"s";
   render();
 }));
}
function filtered(){
 const q=$("q").value.toLowerCase().trim();
 const continents=selectedMulti("continentOptions");
 const senderTypes=selectedMulti("senderTypeOptions");
 const dealTypes=selectedMulti("dealTypeOptions");
 const simple=[["Activity","activity"],["Traveler Type","traveler"]];
 return rows.filter(r=>{
  if(q && !["Subject","Sender","Summary","Region","Category","Destination","Continent","Sender Type","Activity","Traveler Type","Deal Type","Marketing Angle","Reid Tags"].map(k=>val(r,k)).join(" ").toLowerCase().includes(q)) return false;
  if(continents.length && !continents.includes(val(r,"Continent"))) return false;
  if(senderTypes.length && !senderTypes.includes(val(r,"Sender Type"))) return false;
  if(dealTypes.length && !dealTypes.includes(val(r,"Deal Type"))) return false;
  return simple.every(([f,id])=>!$(id).value||val(r,f)===$(id).value);
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
 if(view==="top10") return a.filter(r=>val(r,"Status")!=="Ignore"&&val(r,"Marketing Status")!=="Skip"&&!isExpired(r)&&inPeriod(r,period)).sort((a,b)=>score(b)-score(a)).slice(0,10);
 return a.filter(r=>val(r,"Status")==="New"&&!isExpired(r)).sort((a,b)=>(date(val(b,"Received"))?.getTime()||0)-(date(val(a,"Received"))?.getTime()||0));
}
function cardChips(r){
 const items=[
  [val(r,"AI Importance"),val(r,"AI Importance")==="High"?"high":""],
  [val(r,"Category"),""],[val(r,"Region"),""],[val(r,"Activity"),""],[val(r,"Traveler Type"),""],
  [val(r,"Validity")&&val(r,"Validity")!=="Not stated"?val(r,"Validity"):"","valid"],
  [val(r,"Marketing Status"),""]
 ];
 return items.filter(x=>x[0]).map(([x,c])=>'<span class="chip '+c+'">'+esc(x)+'</span>').join("");
}
async function writeFields(r,updates){
 if(!r||!accessToken)return false;
 const m=map(),data=Object.entries(updates).filter(([k])=>m[k]!=null).map(([k,v])=>({range:"'"+CFG.sheetName.replaceAll("'","''")+"'!"+col(m[k]+1)+r.sheetRow,values:[[v]]}));
 const resp=await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(CFG.spreadsheetId)+"/values:batchUpdate",{method:"POST",headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json"},body:JSON.stringify({valueInputOption:"RAW",data})});
 if(!resp.ok){alert("Update failed: "+await resp.text());return false}
 Object.entries(updates).forEach(([k,v])=>setVal(r,k,v));
 return true;
}
function snapshot(r){
 return {row:r,values:{
  "Status":val(r,"Status"),"Marketing Status":val(r,"Marketing Status"),"Marketing Score":val(r,"Marketing Score"),"Reid Rank":val(r,"Reid Rank"),"Reviewed Date":val(r,"Reviewed Date")
 }};
}
async function quickAction(r,mode,{advanceRapid=false}={}){
 if(!r||isExpired(r))return;
 const now=new Date().toISOString(),before=snapshot(r);let u={};
 if(mode==="promote"){
  u={"Marketing Status":"Shortlist","Status":"Action","Reviewed Date":val(r,"Reviewed Date")||now};
  if(!val(r,"Marketing Score")||Number(val(r,"Marketing Score"))<70)u["Marketing Score"]="70";
 }else if(mode==="demote"){
  u={"Marketing Status":"Candidate","Status":"Reviewed","Reviewed Date":val(r,"Reviewed Date")||now};
  const s=Number(val(r,"Marketing Score"))||50;u["Marketing Score"]=String(Math.max(20,Math.min(59,s-10)));
 }else if(mode==="skip"){
  u={"Marketing Status":"Skip","Status":"Ignore","Reviewed Date":val(r,"Reviewed Date")||now};
 }
 if(await writeFields(r,u)){
  actionHistory.push(before);
  render();
  if(advanceRapid){rapidRows=rapidEligible();if(rapidIndex>=rapidRows.length)rapidIndex=Math.max(0,rapidRows.length-1);renderRapid();}
 }
}
function rapidEligible(){
 return filtered().filter(r=>val(r,"Status")==="New"&&!isExpired(r)).sort((a,b)=>(date(val(b,"Received"))?.getTime()||0)-(date(val(a,"Received"))?.getTime()||0));
}
function supplierName(r){
 const raw=String(val(r,"Sender")||"").trim();
 const noEmail=raw.replace(/<?[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}>?/ig,"").replace(/^["']|["']$/g,"").trim();
 return noEmail||raw||"Unknown supplier";
}
function render(){
 progress();
 $("periodTabs").classList.toggle("hidden",view!=="top10");
 const a=list();
 const expiredHidden=view==="inbox"?filtered().filter(r=>val(r,"Status")==="New"&&isExpired(r)).length:0;
 $("status").textContent=accessToken?(view==="inbox"?a.length+" unreviewed valid items"+(expiredHidden?" · "+expiredHidden+" expired hidden":""):a.length+" items"):"Connect Google to load the sheet.";
 $("cards").innerHTML=a.length?a.map((r,i)=>{
 const deal=val(r,"Deal Type")||"No Deal / News";
 return '<article class="card" data-row="'+r.sheetRow+'">'+(view==="inbox"?'<div class="queue-label">Queue '+(i+1)+' of '+a.length+'</div>':'')+
 '<div class="card-head-row"><div class="card-head-main">'+
 (view==="top10"?'<span class="rank">'+(i+1)+'</span>':'')+
 '<div class="supplier-name">'+esc(supplierName(r))+'</div>'+
 '<div class="sender-meta">'+esc(val(r,"Sender Type"))+' · '+esc(val(r,"Continent"))+'</div>'+
 '<div class="card-title">'+esc(val(r,"Subject"))+'</div></div>'+
 '<div class="card-side"><div class="score">'+score(r)+'</div><span class="deal-badge '+(deal==="No Deal / News"?"none":"")+'">'+esc(deal)+'</span></div></div>'+
 (val(r,"Deal Summary")?'<p class="deal-summary-card">'+esc(val(r,"Deal Summary")).slice(0,360)+'</p>':'')+
 (val(r,"Summary")?'<p class="card-description">'+esc(val(r,"Summary")).slice(0,420)+'</p>':'')+'<div class="chips">'+cardChips(r)+'</div>'+
 '<div class="card-quick-actions">'+
 '<button class="card-back" data-action="back">Back</button>'+
 '<button class="card-demote" data-action="demote">Demote</button>'+
 '<button class="card-skip" data-action="skip">Skip</button>'+
 '<button class="card-promote" data-action="promote">Promote</button>'+
 '</div></article>';
 }).join(""):'<div class="empty">'+(view==="inbox"?"No new items in the queue.":"No items match this view.")+'</div>';
 document.querySelectorAll(".card").forEach(c=>{
  c.addEventListener("click",e=>{
   const btn=e.target.closest("button[data-action]");
   if(btn){
    e.stopPropagation();
    const r=rows.find(x=>x.sheetRow===Number(c.dataset.row));
    if(btn.dataset.action==="back")undoLast(); else quickAction(r,btn.dataset.action);
    return;
   }
   openEditor(Number(c.dataset.row));
  });
 });
}
function renderRapid(){
 const box=$("rapidCard");rapidRows=rapidEligible();
 if(!rapidRows.length){
  $("rapidCount").textContent="0 valid unreviewed";
  box.innerHTML='<div class="empty">No valid unreviewed cards remain.</div>';
  $("rapidPromote").disabled=true;$("rapidDemote").disabled=true;$("rapidSkip").disabled=true;return;
 }
 $("rapidPromote").disabled=false;$("rapidDemote").disabled=false;$("rapidSkip").disabled=false;
 if(rapidIndex>=rapidRows.length)rapidIndex=0;
 const r=rapidRows[rapidIndex],deal=val(r,"Deal Type")||"No Deal / News";
 $("rapidCount").textContent=(rapidIndex+1)+" of "+rapidRows.length+" valid unreviewed";
 box.innerHTML=
  '<div class="rapid-supplier">'+esc(supplierName(r))+'</div>'+
  '<div class="rapid-meta">'+esc(val(r,"Sender Type"))+' · '+esc(val(r,"Continent"))+'</div>'+
  '<div class="rapid-title">'+esc(val(r,"Subject"))+'</div>'+
  '<span class="rapid-deal">'+esc(deal)+'</span>'+
  (val(r,"Deal Summary")?'<div class="rapid-copy"><strong>'+esc(val(r,"Deal Summary"))+'</strong></div>':'')+
  '<div class="rapid-copy">'+esc(val(r,"Summary"))+'</div>'+
  (val(r,"Validity")&&val(r,"Validity")!=="Not stated"?'<div class="rapid-validity">Validity: '+esc(val(r,"Validity"))+'</div>':'');
}
function enterRapid(){
 rapidRows=rapidEligible();rapidIndex=0;renderRapid();$("rapid").showModal();
}
function currentRapid(){rapidRows=rapidEligible();return rapidRows[rapidIndex]||rapidRows[0]||null;}
function compareEligible(){
 return filtered().filter(r=>val(r,"Status")==="New"&&!isExpired(r)).sort((a,b)=>(date(val(b,"Received"))?.getTime()||0)-(date(val(a,"Received"))?.getTime()||0));
}
function compareCardHtml(r,side){
 const deal=val(r,"Deal Type")||"No Deal / News";
 return '<article class="compare-card" data-side="'+side+'">'+
  '<div class="compare-supplier">'+esc(supplierName(r))+'</div>'+
  '<div class="compare-meta">'+esc(val(r,"Sender Type"))+' · '+esc(val(r,"Continent"))+'</div>'+
  '<div class="compare-title">'+esc(val(r,"Subject"))+'</div>'+
  '<span class="compare-deal">'+esc(deal)+'</span>'+
  (val(r,"Deal Summary")?'<div class="compare-copy"><strong>'+esc(val(r,"Deal Summary")).slice(0,360)+'</strong></div>':'')+
  (val(r,"Summary")?'<div class="compare-copy compare-description">'+esc(val(r,"Summary")).slice(0,420)+'</div>':'')+
  (val(r,"Validity")&&val(r,"Validity")!=="Not stated"?'<div class="compare-validity">Validity: '+esc(val(r,"Validity"))+'</div>':'')+
  '<div class="compare-pick">Tap to promote</div>'+
 '</article>';
}
function renderCompare(){
 compareRows=compareEligible();
 if(compareRows.length<2){
  $("compareCount").textContent=compareRows.length+" valid unreviewed";
  $("compareGrid").innerHTML='<div class="empty" style="grid-column:1/-1">Need at least two valid unreviewed cards to compare.</div>';
  comparePair=[];return;
 }
 comparePair=[compareRows[0],compareRows[1]];
 $("compareCount").textContent=compareRows.length+" valid unreviewed";
 $("compareGrid").innerHTML=compareCardHtml(comparePair[0],"0")+compareCardHtml(comparePair[1],"1");
 document.querySelectorAll(".compare-card").forEach(c=>c.onclick=()=>chooseCompare(Number(c.dataset.side)));
}
async function chooseCompare(side){
 if(comparePair.length<2)return;
 const winner=comparePair[side],loser=comparePair[side===0?1:0],now=new Date().toISOString();
 const snapW=snapshot(winner),snapL=snapshot(loser);
 const winUpdates={"Marketing Status":"Shortlist","Status":"Action","Reviewed Date":val(winner,"Reviewed Date")||now};
 if(!val(winner,"Marketing Score")||Number(val(winner,"Marketing Score"))<70)winUpdates["Marketing Score"]="70";
 const loseScore=Number(val(loser,"Marketing Score"))||50;
 const loseUpdates={"Marketing Status":"Candidate","Status":"Reviewed","Reviewed Date":val(loser,"Reviewed Date")||now,"Marketing Score":String(Math.max(20,Math.min(59,loseScore-10)))};
 const ok1=await writeFields(winner,winUpdates);
 if(!ok1)return;
 const ok2=await writeFields(loser,loseUpdates);
 if(!ok2){await writeFields(winner,snapW.values);return;}
 actionHistory.push({compare:true,winner:snapW,loser:snapL});
 render();renderCompare();
}
async function undoLast(){
 const last=actionHistory.pop();if(!last)return;
 if(last.compare){
   await writeFields(last.winner.row,last.winner.values);
   await writeFields(last.loser.row,last.loser.values);
 }else{
   await writeFields(last.row,last.values);
 }
 render();
 rapidRows=rapidEligible();
 if(rapidIndex>=rapidRows.length)rapidIndex=Math.max(0,rapidRows.length-1);
 renderRapid();
 if($("compare")?.open)renderCompare();
}
function enterCompare(){renderCompare();$("compare").showModal();}
function openEditor(row){
 activeRow=rows.find(r=>r.sheetRow===row);if(!activeRow)return;
 $("sender").textContent=val(activeRow,"Sender");$("subject").textContent=val(activeRow,"Subject");$("dealSummary").textContent=val(activeRow,"Deal Summary")||"";$("summary").textContent=val(activeRow,"Summary");$("why").textContent=val(activeRow,"Why It Matters");$("validity").textContent=val(activeRow,"Validity")&&val(activeRow,"Validity")!=="Not stated"?"Validity: "+val(activeRow,"Validity"):"";
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
 ["activity","traveler"].forEach((id,j)=>options(id,["Activity","Traveler Type"][j]));
 $("editor").close();render();
 const next=list()[0];if(view==="inbox"&&next)openEditor(next.sheetRow);
}
async function load(){
 const range=encodeURIComponent("'"+CFG.sheetName+"'!A1:AA2000"),resp=await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(CFG.spreadsheetId)+"/values/"+range+"?majorDimension=ROWS",{headers:{Authorization:"Bearer "+accessToken}});
 if(!resp.ok){$("status").textContent="Could not read the sheet.";return}
 const p=await resp.json(),v=p.values||[];headers=v[0]||[];rows=v.slice(1).filter(r=>r.some(Boolean)).map((x,i)=>({sheetRow:i+2,values:[...x]}));rows.forEach(r=>{while(r.values.length<headers.length)r.values.push("")});
 buildMulti("continentOptions","continentSummary","Continent");buildMulti("senderTypeOptions","senderTypeSummary","Sender Type");buildMulti("dealTypeOptions","dealTypeSummary","Deal Type");options("activity","Activity");options("traveler","Traveler Type");render();
}
function auth(){
 if(CFG.googleClientId.includes("PASTE_")){alert("Google OAuth still needs to be configured in config.js.");return}
 if(!tokenClient)tokenClient=google.accounts.oauth2.initTokenClient({client_id:CFG.googleClientId,scope:SCOPES,callback:r=>{if(r.error)return alert(r.error);accessToken=r.access_token;const expiresAt=Date.now()+(Number(r.expires_in||3600)*1000);localStorage.setItem("eblast_google_token",JSON.stringify({accessToken,expiresAt}));$("auth").textContent="Google connected";load()}});
 tokenClient.requestAccessToken({prompt:accessToken?"":"consent"});
}
$("auth").onclick=auth;
["q","activity","traveler"].forEach(id=>$(id).addEventListener(id==="q"?"input":"change",render));
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");view=b.dataset.view;render()});
document.querySelectorAll(".period").forEach(b=>b.onclick=()=>{document.querySelectorAll(".period").forEach(x=>x.classList.remove("active"));b.classList.add("active");period=b.dataset.period;render()});
$("save").onclick=()=>save("save");$("skip").onclick=()=>save("skip");$("promote").onclick=()=>save("promote");
$("rapidBtn").onclick=enterRapid;
$("compareBtn").onclick=enterCompare;
$("compareExit").onclick=()=>$("compare").close();
$("rapidExit").onclick=()=>$("rapid").close();
$("rapidBack").onclick=undoLast;
$("rapidPromote").onclick=()=>{const r=currentRapid();if(r)quickAction(r,"promote",{advanceRapid:true})};
$("rapidDemote").onclick=()=>{const r=currentRapid();if(r)quickAction(r,"demote",{advanceRapid:true})};
$("rapidSkip").onclick=()=>{const r=currentRapid();if(r)quickAction(r,"skip",{advanceRapid:true})};
render();

const filterToggle=document.getElementById("filterToggle");
if(filterToggle){
  filterToggle.addEventListener("click",()=>{
    const panel=document.getElementById("filtersPanel");
    panel.classList.toggle("open");
    filterToggle.textContent=panel.classList.contains("open")?"Hide filters":"Filters";
  });
}

(function restoreGoogleSession(){
  try{
    const cached=JSON.parse(localStorage.getItem("eblast_google_token")||"null");
    if(cached&&cached.accessToken&&cached.expiresAt>Date.now()+60000){
      accessToken=cached.accessToken;
      $("auth").textContent="Google connected";
      load().catch(()=>{localStorage.removeItem("eblast_google_token");accessToken=null;$("auth").textContent="Connect Google";});
    }else if(cached){
      localStorage.removeItem("eblast_google_token");
    }
  }catch(e){localStorage.removeItem("eblast_google_token");}
})();
