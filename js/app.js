console.info("Relic Protocol build: v94-map-vault-20260725-2");

const STORAGE_KEY="relicProtocolV9_4_live";
const VERSION=94;
const PIN="angel-40";

const DEFAULT_STATE={
  version:VERSION,
  phase:"boot",
  name:"Nevolute",
  class:"Hunter",
  race:"Human",
  completed:[],
  xp:0,
  glimmer:0,
  stats:{mobility:0,resilience:0,recovery:0,discipline:0,strength:0,intellect:0},
  campaign:{
    mode:"live",
    startDate:"2026-07-24",
    startHour:6,
    endHour:20
  },
  codeOverrides:{},
  rcLabelOverrides:{},
  trialOverrides:{},
  masterOverrideCode:"1006",
  musicVolume:0.02
};

let state=loadState();

/* One-time live-safe migration:
   Trial 25 must use the GameStop defaults and Trial 37 the Massage defaults.
   Only removes stale Guild Master overrides for these two slots.
   Completed trials, XP, Glimmer, stats, profile, codes for other trials, etc. remain untouched. */
(function applyGameStopMassageTimingMigration(){
  const MIGRATION_KEY="v94_gamestop_massage_timing_swap_20260725";
  try{
    if(localStorage.getItem(MIGRATION_KEY)==="done")return;
    state.trialOverrides=state.trialOverrides||{};
    state.codeOverrides=state.codeOverrides||{};
    state.rcLabelOverrides=state.rcLabelOverrides||{};

    // Clear only the two stale slot-level overrides so the corrected defaults in data.js win.
    [25,37].forEach(id=>{
      delete state.trialOverrides[id];
      delete state.trialOverrides[String(id)];
      delete state.codeOverrides[id];
      delete state.codeOverrides[String(id)];
      delete state.rcLabelOverrides[id];
      delete state.rcLabelOverrides[String(id)];
    });

    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    localStorage.setItem(MIGRATION_KEY,"done");
  }catch(e){
    console.warn("Timing migration could not be applied.",e);
  }
})();
let selectedClass=state.class;
let selectedRace=state.race;
let currentPage="orbit";
let guildUnlocked=false;
let hudTimer=null;

const app=document.getElementById("app");
const toastEl=document.getElementById("toast");

function clone(v){return JSON.parse(JSON.stringify(v))}
function loadState(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(!raw)return clone(DEFAULT_STATE);
    const parsed=JSON.parse(raw);
    if(parsed.version!==VERSION)return clone(DEFAULT_STATE);
    return {
      ...clone(DEFAULT_STATE),...parsed,
      stats:{...DEFAULT_STATE.stats,...(parsed.stats||{})},
      campaign:{...DEFAULT_STATE.campaign,...(parsed.campaign||{})},
      completed:Array.isArray(parsed.completed)?parsed.completed:[],
      codeOverrides:parsed.codeOverrides||{},
      rcLabelOverrides:parsed.rcLabelOverrides||{},
      trialOverrides:parsed.trialOverrides||{},
      masterOverrideCode:parsed.masterOverrideCode||"1006",
      musicVolume:typeof parsed.musicVolume==="number"?parsed.musicVolume:.02
    };
  }catch(e){
    console.warn("Save file recovered with defaults.",e);
    return clone(DEFAULT_STATE);
  }
}
function normalizeLegacyNames(){
  const rename={
    ["Beard"+" Oil"]:"Grooming Set",
    ["Mystery Recovery"+" Cache"]:"Briefs IV",
    ["Briefs "+"1"]:"Briefs",
    ["Briefs "+"I"]:"Briefs",
    ["Socks "+"1"]:"Socks",
    ["Socks "+"I"]:"Socks",
    ["Sleeping Mask"+" — Edit in Guild Master"]:"Sleeping Mask"
  };
  Object.keys(state.trialOverrides||{}).forEach(id=>{
    const o=state.trialOverrides[id];
    if(o&&rename[o.reward])o.reward=rename[o.reward];
  });
}
normalizeLegacyNames();
function saveState(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}
function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
function toast(msg){toastEl.textContent=msg;toastEl.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>toastEl.classList.remove("show"),2200)}
function rarityClass(r){return r.toLowerCase()}
function percent(n,d=40){return Math.round(n/d*100)}
function getCode(trial){return state.codeOverrides[trial.id]||trial.code}
function getRcLabel(trial){return state.rcLabelOverrides?.[trial.id]||trial.rcLabel}
function currentTrial(){return TRIALS.find(t=>!state.completed.includes(t.id))||null}
function totalStats(){const x={...state.stats},b=CLASS_DATA[state.class].bonus;Object.keys(b).forEach(k=>x[k]+=b[k]);return x}

function slotTimes(){
  const [y,m,d]=state.campaign.startDate.split("-").map(Number);
  const dates=[
    new Date(y,m-1,d),
    new Date(y,m-1,d+1),
    new Date(y,m-1,d+2)
  ];
  const slots=[];
  for(let day=0;day<2;day++){
    for(let hour=state.campaign.startHour;hour<=state.campaign.endHour;hour++){
      const date=new Date(dates[day]);date.setHours(hour,0,0,0);slots.push(date);
    }
  }
  const remaining=40-slots.length;
  for(let i=0;i<remaining;i++){
    const date=new Date(dates[2]);date.setHours(state.campaign.startHour+i,0,0,0);slots.push(date);
  }
  return slots.slice(0,40);
}

function availability(){
  if(state.campaign.mode==="test"){
    return {unlocked:40,next:null,label:"TEST MODE"};
  }
  const now=new Date();
  const slots=slotTimes();
  let unlocked=slots.filter(x=>x<=now).length;
  unlocked=Math.min(40,unlocked);
  const next=slots.find(x=>x>now)||null;
  return {unlocked,next,label:unlocked>=40?"ALL MISSIONS RELEASED":null};
}

function isCurrentAvailable(){
  const trial=currentTrial();
  if(!trial)return true;
  return trial.id<=availability().unlocked;
}

function formatCountdown(target){
  if(!target)return "COMPLETE";
  const diff=Math.max(0,target-Date.now());
  const h=Math.floor(diff/3600000);
  const m=Math.floor((diff%3600000)/60000);
  const s=Math.floor((diff%60000)/1000);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function bootSequence(){
  clearInterval(hudTimer);
  state.phase="boot";saveState();
  app.innerHTML=`
  <section class="boot-stage">
    <div class="boot-panel glass">
      <div class="boot-inner">
        <svg class="logo-mark" viewBox="0 0 100 100"><polygon points="50,5 92,50 50,95 8,50" fill="none" stroke="#77dcff" stroke-width="2"/><circle cx="50" cy="50" r="11" fill="#eef5ff"/><path d="M50 18 L62 38 L82 50 L62 62 L50 82 L38 62 L18 50 L38 38 Z" fill="none" stroke="#b997ff" stroke-width="2"/></svg>
        <div class="eyebrow">Guild Headquarters // Restricted Protocol</div>
        <h1 class="hero-title">The Relic<br>Protocol</h1>
        <div class="hero-sub">The Forty Trials</div>
        <div id="bootLog" class="boot-log"></div>
        <div id="bootControls" class="hidden">
          <div class="field"><label>Guardian Name</label><input id="guardianName" value="${escapeHtml(state.name)}"></div>
          <button id="confirmIdentity" class="btn primary">Confirm Identity</button>
        </div>
      </div>
    </div>
  </section>`;
  const lines=["INIT // Guild Headquarters uplink","SCANNING // Guardian signal","SIGNAL DETECTED // Identity unresolved","GHOST LINK // Awaiting authorization"];
  const log=document.getElementById("bootLog");
  lines.forEach((line,i)=>setTimeout(()=>{
    if(!document.getElementById("bootLog"))return;
    const div=document.createElement("div");div.textContent=`> ${line}`;log.appendChild(div);
    if(i===lines.length-1)setTimeout(()=>{
      document.getElementById("bootControls")?.classList.remove("hidden");
      const button=document.getElementById("confirmIdentity");
      if(button)button.onclick=()=>{
        state.name=document.getElementById("guardianName").value.trim()||"Nevolute";saveState();classSelection();
      };
    },350);
  },i*450));
}

function bonusMarkup(data){
  return Object.entries(data.bonus).map(([stat,value])=>`
    <div class="class-bonus">
      <span>${stat}</span><b>+${value}</b>
      <div class="mini-bars">${Array.from({length:10},(_,i)=>`<i class="${i<value/1?"on":""}"></i>`).join("")}</div>
    </div>`).join("");
}

function classSelection(){
  clearInterval(hudTimer);
  state.phase="class";saveState();
  app.innerHTML=`
  <section class="selection-wrap class-selection">
    <div class="selection-header"><div class="eyebrow">Guardian Configuration // Phase 01</div><h1>Choose Your Class</h1><p class="muted">Compare the permanent starting bonuses before confirming your Guardian.</p></div>
    <div class="selection-grid">
      ${Object.entries(CLASS_DATA).map(([name,data])=>`
      <button class="selection-card class-card class-${name.toLowerCase()} ${selectedClass===name?"selected":"dimmed"}" data-class="${name}" style="--class-color:${data.color}">
        <div class="selection-art" style="background-image:url('${data.art}')"></div>
        <div class="selection-copy">
          <div class="selection-icon">${data.icon}</div>
          <div class="class-name">${name}</div>
          <div class="eyebrow">${data.role}</div>
          <p>${data.description}</p>
          <div class="bonus-panel">${bonusMarkup(data)}</div>
        </div>
      </button>`).join("")}
    </div>
    <div class="selection-actions"><button id="classBack" class="btn ghost">Return</button><button id="classContinue" class="btn primary">Confirm ${selectedClass}</button></div>
  </section>`;
  document.querySelectorAll("[data-class]").forEach(card=>card.onclick=()=>{selectedClass=card.dataset.class;classSelection()});
  document.getElementById("classBack").onclick=bootSequence;
  document.getElementById("classContinue").onclick=()=>{state.class=selectedClass;saveState();raceSelection()};
}

function raceSelection(){
  clearInterval(hudTimer);
  state.phase="race";saveState();
  app.innerHTML=`
  <section class="selection-wrap">
    <div class="selection-header"><div class="eyebrow">Guardian Configuration // Phase 02</div><h1>Choose Your Origin</h1><p class="muted">Origin is cosmetic and affects your Guardian profile lore.</p></div>
    <div class="selection-grid">
      ${Object.entries(RACE_DATA).map(([name,data])=>`
      <button class="selection-card race-card ${selectedRace===name?"selected":"dimmed"}" data-race="${name}" style="--class-color:${data.color}">
        <div class="selection-art" style="background-image:url('${data.art}')"></div>
        <div class="selection-copy">
          <div class="selection-icon">${data.icon}</div><div class="class-name">${name}</div><div class="eyebrow">${data.tagline}</div><p>${data.description}</p>
        </div>
      </button>`).join("")}
    </div>
    <div class="selection-actions"><button id="raceBack" class="btn ghost">Back to Classes</button><button id="raceContinue" class="btn primary">Synchronize Ghost</button></div>
  </section>`;
  document.querySelectorAll("[data-race]").forEach(card=>card.onclick=()=>{selectedRace=card.dataset.race;raceSelection()});
  document.getElementById("raceBack").onclick=classSelection;
  document.getElementById("raceContinue").onclick=()=>{state.race=selectedRace;state.phase="sync";saveState();syncSequence()};
}

function syncSequence(){
  clearInterval(hudTimer);
  app.innerHTML=`<section class="transition-screen"><div><div class="ghost-core"><div class="ghost-eye"></div></div><div class="eyebrow">Ghost Synchronization</div><h1 style="font-size:clamp(2.2rem,6vw,5rem)">Establishing Link</h1><p id="syncText" class="muted">Calibrating Guardian profile...</p><div class="sync-bar"><i id="syncFill"></i></div></div></section>`;
  let p=0;const messages={20:"Reading class signature...",42:"Applying origin profile...",64:"Mapping condo sectors...",82:"Loading campaign clock...",100:"Synchronization complete."};
  const timer=setInterval(()=>{p+=2;const fill=document.getElementById("syncFill");if(!fill){clearInterval(timer);return}fill.style.width=p+"%";if(messages[p])document.getElementById("syncText").textContent=messages[p];if(p>=100){clearInterval(timer);state.phase="app";saveState();setTimeout(titleReveal,500)}},50);
}

function titleReveal(){
  app.innerHTML=`<section class="transition-screen"><div><div class="eyebrow">Guardian Profile Created</div><h1 class="hero-title">The Relic<br>Protocol</h1><div class="hero-sub">The Forty Trials</div><p class="muted" style="margin-top:28px">${escapeHtml(state.name)} // ${state.class} // ${state.race}</p></div></section>`;
  setTimeout(()=>renderApp("orbit"),1700);
}

function hudMarkup(){
  const trial=currentTrial();
  const available=availability();
  const ready=isCurrentAvailable();
  return `
  <aside class="guardian-hud glass">
    <div class="hud-user"><span class="hud-class" style="color:${CLASS_DATA[state.class].color}">${CLASS_DATA[state.class].icon}</span><div><b>${escapeHtml(state.name)}</b><small>${state.class} // ${state.race}</small></div></div>
    <div class="hud-grid">
      <span>${ICONS.rank} Rank <b>${Math.floor(state.xp/1000)+1}</b></span>
      <span>${ICONS.mission} Mission <b>${trial?trial.id:40}/40</b></span>
    </div>
    <div class="hud-countdown ${ready?"ready":""}"><small>${ready?"MISSION STATUS":"NEXT MISSION"}</small><b id="hudCountdown">${ready?(trial?"AVAILABLE":"COMPLETE"):formatCountdown(available.next)}</b></div>
  </aside>`;
}

function renderApp(page=currentPage){
  currentPage=page;state.phase="app";saveState();
  clearInterval(hudTimer);
  const navPages=["orbit","campaign","map","vault","codex","console"];
  app.innerHTML=`
  ${hudMarkup()}
  <main class="shell app-shell">
    <header class="topbar glass">
      <div class="brand"><button id="relicLogoEgg" class="relic-logo-egg" aria-label="Relic Protocol insignia"><span class="relic-logo-shape"></span></button><div>Relic Protocol<small>Guild Headquarters Network</small></div></div>
      <nav class="nav">${navPages.map(name=>`<button data-page="${name}" class="${name===page?"active":""}"><span>${ICONS[name]}</span>${name==="console"?"Guild Master":name}</button>`).join("")}</nav>
    </header>
    <section id="screen" class="screen active"></section>
    <div class="footer-note">THE RELIC PROTOCOL // PRIVATE GUARDIAN BUILD</div>
  </main>`;
  document.querySelectorAll("[data-page]").forEach(btn=>btn.onclick=()=>btn.dataset.page==="console"?requestGuildAccess():renderApp(btn.dataset.page));
  const screen=document.getElementById("screen");
  ({orbit:renderOrbit,campaign:renderCampaign,map:renderMap,vault:renderVault,codex:renderCodex,console:renderConsole}[page]||renderOrbit)(screen);
  hudTimer=setInterval(updateHud,1000);
}

function updateHud(){
  const el=document.getElementById("hudCountdown");if(!el)return;
  const trial=currentTrial(),ready=isCurrentAvailable(),a=availability();
  el.textContent=ready?(trial?"AVAILABLE":"COMPLETE"):formatCountdown(a.next);
  const box=el.closest(".hud-countdown");box?.classList.toggle("ready",ready);
}

function statsMarkup(){
  return Object.entries(totalStats()).map(([key,value])=>`<div class="stat"><span>${key}</span><div class="progress"><i style="width:${Math.min(value,100)}%"></i></div><b>${value}</b></div>`).join("");
}

function renderOrbit(screen){
  const trial=currentTrial(),ready=isCurrentAvailable();
  screen.innerHTML=`
  <div class="orbit-hero">
    <div class="card glass guardian-panel class-accent-${state.class.toLowerCase()}">
      <div class="eyebrow">${ICONS.orbit} Guardian Profile</div><div class="guardian-name">${escapeHtml(state.name)}</div>
      <div class="row"><span class="tag">${CLASS_DATA[state.class].icon} ${state.class}</span><span class="tag">${RACE_DATA[state.race].icon} ${state.race}</span><span class="tag">${ICONS.rank} Rank ${Math.floor(state.xp/1000)+1}</span></div>
      <p class="muted" style="margin-top:20px">${trial?(ready?`Trial ${String(trial.id).padStart(2,"0")} is ready for deployment.`:`Trial ${String(trial.id).padStart(2,"0")} remains time-locked.`):"All forty recovery signals have been resolved."}</p>
    </div>
    <div class="card glass"><div class="eyebrow">Guardian Stats</div>${statsMarkup()}</div>
  </div>
  <div class="grid g4" style="margin-top:14px">
    <button class="card glass metric orbit-link-card" data-orbit-link="campaign"><small>${ICONS.campaign} Campaign</small><strong>${percent(state.completed.length)}%</strong><div class="progress"><i style="width:${percent(state.completed.length)}%"></i></button></div>
    <button class="card glass metric orbit-link-card" data-orbit-link="vault"><small>${ICONS.vault} Vault</small><strong>${state.completed.length}/40</strong></button>
    <button class="card glass metric orbit-link-card" data-orbit-link="codex"><small>${ICONS.codex} Codex</small><strong>${state.completed.filter(id=>LANGUAGE_TRIAL_IDS.includes(id)).length}/8</strong></button>
    <div class="card glass metric"><small>${ICONS.glimmer} Glimmer</small><strong>${state.glimmer.toLocaleString()}</strong></div>
  </div>
  <div class="card glass current-signal" style="margin-top:14px"><div class="eyebrow">${ICONS.lock} Current Signal</div><h2>${trial?`Trial ${String(trial.id).padStart(2,"0")} // Encrypted Relic`:"Campaign Complete"}</h2><p class="muted">${trial?(trial.missionType==="recovery"?`${SECTORS[trial.sector].icon} Sector ${trial.sector} // ${SECTORS[trial.sector].name}`:"◫ Language Transmission // Guild Master Delivery"):"Final transmission archived."}</p></div>`;
}

function renderCampaign(screen){
  const trial=currentTrial(),ready=isCurrentAvailable();
  const done=TRIALS.filter(t=>state.completed.includes(t.id));
  const locked=TRIALS.filter(t=>!state.completed.includes(t.id)&&t.id!==trial?.id);
  screen.innerHTML=`
  ${trial?`<div class="active-trial glass ${ready?"ready-trial":"locked-trial"}">
    <div class="eyebrow">${ready?"ACTIVE TRIAL":"TIME-LOCKED"} // ${String(trial.id).padStart(2,"0")}</div>
    <div class="trial-title">${ready?"Encrypted Relic":"Signal Pending"}</div>
    <div class="row"><span class="badge ${rarityClass(trial.rarity)}">${trial.rarity} signal</span><span class="tag">${trial.missionType==="recovery"?`${SECTORS[trial.sector].icon} Sector ${trial.sector}`:"◫ Language Transmission"}</span></div>
    <p>${ready?(trial.missionType==="recovery"?`A recovery container has been detected in <b>${trial.sector} — ${SECTORS[trial.sector].name}</b>. The relic identity remains classified until the code is verified.`:"An encrypted Italian language fragment is blocking access to the recovery code."):`Next mission authorization is pending. The HUD countdown will update automatically.`}</p>
    <button id="beginMission" class="btn primary" ${ready?"":"disabled"}>${ready?"Begin Mission":"Mission Locked"}</button>
  </div>`:`<div class="active-trial glass reward-flash"><div class="eyebrow">Campaign Complete</div><div class="trial-title">Forty Trials Cleared</div><p>All relics recovered. Final birthday transmission unlocked.</p></div>`}
  <details><summary>${ICONS.campaign} Completed Missions (${done.length})</summary><div class="detail-body">${done.length?done.map(t=>`<div class="list-item"><div><b>${t.icon} Trial ${t.id}: ${t.reward}</b><br><small class="muted">${t.missionType==="recovery"?t.sector:"Language Transmission"} · Code verified</small></div><span class="badge ${rarityClass(t.rarity)}">${t.rarity}</span></div>`).join(""):"<p>No completed missions yet.</p>"}</div></details>
  <details><summary>${ICONS.lock} Classified Missions (${locked.length})</summary><div class="detail-body">${locked.map(t=>`<div class="list-item"><div><b>Trial ${String(t.id).padStart(2,"0")}</b><br><small class="muted">██████████ · Relic encrypted</small></div><span class="badge">Classified</span></div>`).join("")}</div></details>`;
  if(trial&&ready)document.getElementById("beginMission").onclick=()=>openMission(trial);
}

function openMission(trial){
  setTimeout(()=>ghostSay(trial.sourceType==="sector"?"sector":(trial.missionType==="language"?"language":"mission"),true),220);
  const modal=document.createElement("div");modal.className="modal";
  if(trial.missionType==="recovery"){
    modal.innerHTML=`<div class="modal-box glass">
      <div class="eyebrow">${SECTORS[trial.sector].icon} Trial ${String(trial.id).padStart(2,"0")} // Seek & Retrieve</div>
      <h2>Recovery Signal Located</h2>
      <div class="sector-callout"><span>${SECTORS[trial.sector].icon}</span><div><small>SECTOR</small><b>${trial.sector}</b><p>${SECTORS[trial.sector].name}</p></div></div>
      <p>Locate and retrieve the marked recovery container. Do not open the relic screen until the physical container is secured.</p>
      <button id="retrieved" class="btn primary">Container Retrieved</button>
      <button class="btn ghost exit-mission">Exit Mission</button>
    </div>`;
  }else{
    const [phrase,pronunciation,meaning]=trial.phrase;
    const wrong=["See you tomorrow.","You are late.","Good night."];
    const options=[meaning,...wrong].map(v=>[Math.random(),v]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
    modal.innerHTML=`<div class="modal-box glass">
      <div class="eyebrow">◫ Trial ${String(trial.id).padStart(2,"0")} // Language Transmission</div>
      <h2>Encrypted Italian Fragment</h2>
      <div class="italian">${phrase}</div><div class="pronunciation">Pronunciation: ${pronunciation}</div>
      <h3 style="margin-top:22px">Select the correct meaning</h3>
      ${options.map(v=>`<button class="option" data-language="${v===meaning}">${v}</button>`).join("")}
      <button id="needHelp" class="help-button">Need help?</button><div id="helpMessage" class="help-line hidden">☎ Call your Italian Language Specialist: Mom.</div>
      <button class="btn ghost exit-mission">Exit Mission</button>
    </div>`;
  }
  document.body.appendChild(modal);
  modal.querySelectorAll(".exit-mission").forEach(b=>b.onclick=()=>modal.remove());
  if(trial.missionType==="recovery"){
    document.getElementById("retrieved").onclick=()=>showCodeEntry(modal,trial);
  }else{
    document.getElementById("needHelp").onclick=()=>{document.getElementById("helpMessage").classList.toggle("hidden");ghostSay("help",true)};
    modal.querySelectorAll("[data-language]").forEach(btn=>btn.onclick=()=>{
      if(btn.dataset.language==="true"){btn.classList.add("correct");setTimeout(()=>showCodeEntry(modal,trial),350)}
      else{btn.classList.add("wrong");toast("Translation unsuccessful. Try again or request help.");ghostSay("wrong",true)}
    });
  }
}

function showCodeEntry(modal,trial){
  modal.querySelector(".modal-box").innerHTML=`
    <div class="eyebrow">${ICONS.lock} Recovery Authorization</div><h2>Enter Container Code</h2>
    <p class="muted">The relic identity remains hidden until the code printed on the recovery container is verified.</p>
    <div class="code-lock"><input id="recoveryCode" maxlength="8" autocomplete="off" placeholder="ENTER CODE"><button id="verifyCode" class="btn primary">Verify</button></div>
    <div id="codeError" class="code-error hidden">ACCESS DENIED // Incorrect recovery code</div>
    <button class="btn ghost exit-mission">Exit Mission</button>`;
  modal.querySelector(".exit-mission").onclick=()=>modal.remove();
  const verify=()=>{
    const entered=document.getElementById("recoveryCode").value.trim().toUpperCase();
    if(entered===getCode(trial).toUpperCase())showReward(modal,trial);
    else{ghostSay("badcode",true);document.getElementById("codeError").classList.remove("hidden");document.getElementById("recoveryCode").classList.add("shake");setTimeout(()=>document.getElementById("recoveryCode")?.classList.remove("shake"),450)}
  };
  document.getElementById("verifyCode").onclick=verify;
  document.getElementById("recoveryCode").onkeydown=e=>{if(e.key==="Enter")verify()};
  document.getElementById("recoveryCode").focus();
}

function showReward(modal,trial){
  setTimeout(()=>ghostSay(trial.rarity,true),350);
  modal.querySelector(".modal-box").innerHTML=`
    <div class="reward-reveal ${rarityClass(trial.rarity)}">
      <div class="reward-rays"></div><div class="reward-icon">${trial.icon}</div>
      <div class="eyebrow">Relic Decrypted // Trial ${String(trial.id).padStart(2,"0")}</div>
      <h1>${trial.reward}</h1><span class="badge ${rarityClass(trial.rarity)}">${trial.rarity}</span>
      <p>+${trial.xp} XP ${trial.glimmer?`· +${trial.glimmer.toLocaleString()} Glimmer`:""}</p>
      <button id="claimReward" class="btn primary">Add to Vault</button>
    </div>`;
  document.getElementById("claimReward").onclick=()=>completeTrial(modal,trial);
}

function completeTrial(modal,trial){
  if(state.completed.includes(trial.id))return;
  state.completed.push(trial.id);state.xp+=trial.xp;state.glimmer+=trial.glimmer;Object.keys(trial.stats).forEach(k=>state.stats[k]+=trial.stats[k]);saveState();modal.remove();
  showMissionCompleteFx(trial);
  if(trial.id===40){saveState();setTimeout(launchCredits,3000);return;}
  setTimeout(()=>{renderApp("campaign");toast(`Trial ${trial.id} complete`)},2350);
}

function sectorState(sector){
  const current=currentTrial();
  if(current?.sector===sector&&isCurrentAvailable())return "current";
  if(TRIALS.some(t=>t.sector===sector&&state.completed.includes(t.id)))return "visited";
  const available=availability().unlocked;
  if(TRIALS.some(t=>t.sector===sector&&t.id<=available))return "available";
  return "locked";
}

function renderMap(screen){
  const nodes={
    Alpha:[500,70],Bravo:[700,190],Delta:[300,260],Kilo:[655,330],Charlie:[500,430],
    "Mess Hall":[270,570],Golf:[730,570],Echo:[150,750],Foxtrot:[370,750],Juliet:[650,750],Hotel:[850,750],India:[850,930]
  };
  const lines=[
    ["Alpha","Charlie"],["Bravo","Charlie"],["Delta","Charlie"],["Kilo","Charlie"],
    ["Charlie","Mess Hall"],["Charlie","Golf"],["Mess Hall","Echo"],["Mess Hall","Foxtrot"],
    ["Golf","Juliet"],["Golf","Hotel"],["Hotel","India"]
  ];
  screen.innerHTML=`
  <div class="card glass condo-map-card"><div class="eyebrow">${ICONS.map} Tactical Condo Map</div><h2>Guild Headquarters Sector Network</h2><p class="muted">Mapped from the condo layout. Real room names remain encrypted; only operational codenames are displayed.</p>
    <div class="condo-map-wrap">
      <svg class="condo-map" viewBox="0 0 1000 1020" role="img" aria-label="Condo tactical sector map">
        <defs><filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
        ${lines.map(([a,b])=>`<line x1="${nodes[a][0]}" y1="${nodes[a][1]}" x2="${nodes[b][0]}" y2="${nodes[b][1]}" class="map-line"/>`).join("")}
        ${Object.entries(nodes).map(([sector,[x,y]])=>{const s=sectorState(sector),meta=SECTORS[sector];return `<g class="map-node ${s}" transform="translate(${x},${y})"><circle r="54"/><circle r="43" class="inner"/><text class="node-icon" y="-7">${meta.icon}</text><text class="node-code" y="17">${sector}</text><text class="node-name" y="76">${s==="locked"?"ENCRYPTED":meta.name}</text></g>`}).join("")}
      </svg>
    </div>
    <div class="map-legend"><span><i class="dot current"></i> Active</span><span><i class="dot visited"></i> Recovered</span><span><i class="dot available"></i> Decrypted</span><span><i class="dot locked"></i> Locked</span></div>
  </div>`;
}

function renderVault(screen){
  const unlocked=TRIALS.filter(t=>state.completed.includes(t.id)),cats=["Credits","Equipment","Provisions","Vouchers","Miscellaneous"];
  screen.innerHTML=`<div class="eyebrow">${ICONS.vault} Recovered Inventory</div><h2>Vault</h2>${cats.map(cat=>`<details ${unlocked.some(t=>t.category===cat)?"open":""}><summary>${ICONS[cat]} ${cat}</summary><div class="detail-body grid g3">${unlocked.filter(t=>t.category===cat).map(t=>`<div class="vault-card"><div class="vault-icon">${t.icon}</div><span class="badge ${rarityClass(t.rarity)}">${t.rarity}</span><h3>${t.reward}</h3><small class="muted">Trial ${t.id} // ${t.sector||"Guild Master"}</small></div>`).join("")||"<p>No recovered relics.</p>"}</div></details>`).join("")}`;
}

function renderCodex(screen){
  const learned=TRIALS.filter(t=>state.completed.includes(t.id)&&t.phrase);
  screen.innerHTML=`<div class="card glass"><div class="eyebrow">${ICONS.codex} Italian Language Archive</div><h2>Codex</h2><p class="muted">${learned.length}/8 fragments decrypted. Pronunciation remains available for review.</p>${learned.length?learned.map(t=>`<div class="codex-entry"><div><b>${t.phrase[0]}</b><br><span class="pronunciation">${t.phrase[1]}</span><br><small>${t.phrase[2]}</small></div><span class="badge">Learned</span></div>`).join(""):"<div class='empty-state'>No language fragments recovered yet.</div>"}</div>`;
}

function requestGuildAccess(){
  if(guildUnlocked){renderApp("console");return}
  const modal=document.createElement("div");modal.className="modal";modal.innerHTML=`<div class="modal-box glass pin-panel"><div class="eyebrow">${ICONS.console} Restricted Access</div><h2>Guild Master Authentication</h2><p class="muted">Enter Guild Master PIN.</p><input id="guildPin" type="password" placeholder="PIN"><button id="unlockGuild" class="btn primary">Unlock</button><div id="pinError" class="code-error hidden">AUTHENTICATION FAILED</div><button class="btn ghost close-pin">Cancel</button></div>`;document.body.appendChild(modal);
  modal.querySelector(".close-pin").onclick=()=>modal.remove();
  const unlock=()=>{if(document.getElementById("guildPin").value===PIN){guildUnlocked=true;modal.remove();renderApp("console")}else document.getElementById("pinError").classList.remove("hidden")};
  document.getElementById("unlockGuild").onclick=unlock;document.getElementById("guildPin").onkeydown=e=>{if(e.key==="Enter")unlock()};document.getElementById("guildPin").focus();
}

function awardUntil(target){
  for(let id=1;id<=target;id++){if(state.completed.includes(id))continue;const t=TRIALS[id-1];state.completed.push(id);state.xp+=t.xp;state.glimmer+=t.glimmer;Object.keys(t.stats).forEach(k=>state.stats[k]+=t.stats[k])}saveState();renderApp("console");
}

function renderConsole(screen){
  const trial=currentTrial();
  screen.innerHTML=`
  <div class="card glass"><div class="eyebrow">${ICONS.console} Guild Master Angel // Authorized</div><h2>Campaign Control</h2>
    <div class="mode-switch"><button class="mode-option ${state.campaign.mode==="test"?"active":""}" data-mode="test"><b>Trial Test</b><small>Time restrictions disabled</small></button><button class="mode-option ${state.campaign.mode==="live"?"active":""}" data-mode="live"><b>Live Campaign</b><small>One mission released per hour</small></button></div>
    <div class="grid g3 settings-grid">
      <div class="field"><label>Campaign Friday</label><input id="campaignDate" type="date" value="${state.campaign.startDate}"></div>
      <div class="field"><label>Friday/Saturday Window</label><input value="6:00 AM — 8:00 PM" disabled></div>
      <div class="field"><label>Sunday</label><input value="6:00 AM until Trial 40" disabled></div>
    </div>
    <div class="row"><button id="saveCampaign" class="btn primary">Save Campaign Mode</button><button id="lockGuildMaster" class="btn">Lock Guild Master</button></div>
  </div>
  <div class="card glass" style="margin-top:14px"><div class="eyebrow">${ICONS.lock} Recovery Codes</div><h2>Container Authorization</h2><p class="muted">Current active code: <b>${trial?getCode(trial):"Campaign complete"}</b>. Codes can be changed below before printing or labeling containers.</p>
    <details><summary>Edit All 40 Codes</summary><div class="detail-body code-grid">${TRIALS.map(t=>`<label><span>${String(t.id).padStart(2,"0")}</span><input data-code-id="${t.id}" value="${getCode(t)}"></label>`).join("")}</div><button id="saveCodes" class="btn primary">Save Codes</button></details>
  </div>
  <div class="card glass" style="margin-top:14px"><div class="eyebrow">Testing Controls</div><h2>Campaign Progress</h2><div class="row"><button id="completeNext" class="btn primary">Complete Next</button><button id="complete20" class="btn">Complete First 20</button><button id="jump39" class="btn">Jump to Trial 39</button><button id="replayIntro" class="btn">Replay Intro</button><button id="resetAll" class="btn danger">Reset Everything</button></div></div>`;
  document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{state.campaign.mode=b.dataset.mode;document.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("active",x===b))});
  document.getElementById("saveCampaign").onclick=()=>{state.campaign.startDate=document.getElementById("campaignDate").value||state.campaign.startDate;saveState();toast(`Campaign set to ${state.campaign.mode.toUpperCase()} mode`);renderApp("console")};
  document.getElementById("saveCodes").onclick=()=>{document.querySelectorAll("[data-code-id]").forEach(input=>state.codeOverrides[input.dataset.codeId]=input.value.trim().toUpperCase());saveState();toast("Recovery codes saved")};
  document.getElementById("completeNext").onclick=()=>{const t=currentTrial();if(t){const fake=document.createElement("div");fake.remove=()=>{};completeTrial(fake,t)}};
  document.getElementById("complete20").onclick=()=>awardUntil(20);
  document.getElementById("jump39").onclick=()=>{state.completed=[];state.xp=0;state.glimmer=0;state.stats=clone(DEFAULT_STATE.stats);saveState();awardUntil(38)};
  document.getElementById("replayIntro").onclick=titleReveal;
  document.getElementById("resetAll").onclick=()=>{if(confirm("Reset Guardian, campaign settings, codes, and all progress?")){localStorage.removeItem(STORAGE_KEY);state=clone(DEFAULT_STATE);guildUnlocked=false;selectedClass=state.class;selectedRace=state.race;bootSequence()}};
}

function starfield(){
  const canvas=document.getElementById("starfield"),ctx=canvas.getContext("2d");let stars=[];
  function resize(){canvas.width=innerWidth*devicePixelRatio;canvas.height=innerHeight*devicePixelRatio;canvas.style.width=innerWidth+"px";canvas.style.height=innerHeight+"px";stars=Array.from({length:Math.min(260,Math.floor(innerWidth/4))},()=>({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:(Math.random()*1.2+.2)*devicePixelRatio,s:(Math.random()*.25+.04)*devicePixelRatio,a:Math.random()*.7+.2}))}
  function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);for(const s of stars){s.y+=s.s;if(s.y>canvas.height){s.y=0;s.x=Math.random()*canvas.width}ctx.globalAlpha=s.a;ctx.fillStyle="#e4f7ff";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1;requestAnimationFrame(draw)}
  resize();addEventListener("resize",resize);draw();
}

/* ===== V7 GAMEPLAY + RESPONSIVE + AUDIO OVERRIDES ===== */
let audioEngine=null,musicOn=true;
function ensureAudio(){if(audioEngine)return audioEngine;const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;const ctx=new C(),master=ctx.createGain();master.gain.value=.12;master.connect(ctx.destination);audioEngine={ctx,master,ambient:null};startAmbient();return audioEngine}
function tone(freq=440,duration=.08,type="sine",gain=.14,delay=0){const a=ensureAudio();if(!a)return;const o=a.ctx.createOscillator(),g=a.ctx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(0,a.ctx.currentTime+delay);g.gain.linearRampToValueAtTime(gain,a.ctx.currentTime+delay+.01);g.gain.exponentialRampToValueAtTime(.001,a.ctx.currentTime+delay+duration);o.connect(g);g.connect(a.master);o.start(a.ctx.currentTime+delay);o.stop(a.ctx.currentTime+delay+duration+.02)}
function sfx(name){
  if(name==="click")tone(510,.055,"triangle",.075);
  if(name==="success"){
    tone(480,.12,"sine",.085);
    tone(760,.19,"triangle",.07,.065);
  }
  if(name==="error"){
    tone(170,.16,"square",.045);
    tone(115,.15,"sine",.04,.075);
  }
  if(name==="reveal"){
    tone(310,.28,"sine",.08);
    tone(620,.36,"triangle",.075,.1);
    tone(1040,.48,"sine",.05,.22);
  }
  if(name==="mission"){
    // Short orbital launch: power-up -> ignition -> warp chirp.
    tone(72,.52,"sine",.13,0);
    tone(110,.42,"sawtooth",.075,.05);
    tone(180,.34,"triangle",.09,.18);
    tone(360,.28,"triangle",.075,.31);
    tone(720,.22,"sine",.07,.43);
    tone(1180,.19,"sine",.055,.54);
    tone(1480,.12,"triangle",.04,.63);
  }
}
let ambientTrack=null;
function startAmbient(){
  if(!ambientTrack){
    ambientTrack=new Audio("assets/audio/aurora-game-menu-pulse.mp3");
    ambientTrack.loop=true;
    ambientTrack.preload="auto";
  }
  ambientTrack.volume=Math.max(0,Math.min(.1,state.musicVolume??.02));
  if(musicOn && ambientTrack.paused)ambientTrack.play().catch(()=>{});
}
function toggleMusic(){
  musicOn=!musicOn;
  ensureAudio();
  if(!ambientTrack)startAmbient();
  if(ambientTrack){
    ambientTrack.volume=Math.max(0,Math.min(.1,state.musicVolume??.02));
    if(musicOn)ambientTrack.play().catch(()=>{});
    else ambientTrack.pause();
  }
  document.getElementById("musicToggle")?.classList.toggle("muted-audio",!musicOn);
  toast(musicOn?"Ambient audio enabled":"Ambient audio muted");
}
function speakItalian(text){ensureAudio();if(!("speechSynthesis" in window)){toast("Speech playback is not supported in this browser.");return}speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang="it-IT";u.rate=.78;u.pitch=1;speechSynthesis.speak(u);sfx("click")}
document.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.id==="quickStart"||b.id==="beginMission")return;sfx("click")},{capture:true});
function unlockAmbientPlayback(){
  ensureAudio();
  startAmbient();
  if(ambientTrack && musicOn && ambientTrack.paused){
    ambientTrack.play().then(()=>{
      const pp=document.getElementById("musicPlayPause");if(pp)pp.textContent="⏸";
      const mt=document.getElementById("musicToggle");if(mt)mt.textContent="🔊";
    }).catch(()=>{});
  }
}
["pointerdown","touchstart","keydown"].forEach(evt=>document.addEventListener(evt,unlockAmbientPlayback,{passive:true}));

function sourceLabel(t){if(t.sourceType==="depot")return "LOOT DEPOT";if(t.sourceType==="delivery")return "GUILD MASTER DELIVERY";return `SECTOR ${t.sector}`}
function nextUnlockText(){const a=availability();if(isCurrentAvailable())return currentTrial()?"AVAILABLE NOW":"CAMPAIGN COMPLETE";return a.next?a.next.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}):"COMPLETE"}
function hudMarkup(){const t=currentTrial(),a=availability(),ready=isCurrentAvailable();return `<section class="integrated-hud glass"><div class="hud-brand"><span class="hud-class" style="color:${CLASS_DATA[state.class].color}">${CLASS_DATA[state.class].icon}</span><div><b>${escapeHtml(state.name)}</b><small>${state.class} // ${state.race}</small></div></div><div class="hud-stat"><small>RANK</small><b>${Math.floor(state.xp/1000)+1}</b></div><div class="hud-stat"><small>MISSION</small><b>${t?t.id:40}/40</b></div><div class="hud-stat hud-glimmer"><small>GLIMMER</small><b>${state.glimmer.toLocaleString()}</b></div><div class="hud-time"><small>${ready?"STATUS":"UNLOCKS AT"}</small><b id="hudUnlockTime">${ready?(t?"AVAILABLE":"COMPLETE"):nextUnlockText()}</b><span id="hudCountdown">${ready?"READY":formatCountdown(a.next)}</span></div><button id="musicToggle" class="sound-toggle" title="Toggle ambient audio">◉ SOUND</button></section>`}
function renderApp(page=currentPage){currentPage=page;state.phase="app";saveState();clearInterval(hudTimer);const navPages=["orbit","campaign","map","vault","codex","console"];app.innerHTML=`<main class="shell"><header class="topbar glass"><div class="brand">Relic Protocol<small>Guild Headquarters Network</small></div><nav class="nav">${navPages.map(n=>`<button data-page="${n}" class="${n===page?"active":""}"><span>${ICONS[n]}</span><em>${n==="console"?"Guild Master":n}</em></button>`).join("")}</nav></header>${hudMarkup()}<section id="screen" class="screen active"></section><div class="footer-note">THE RELIC PROTOCOL // PRIVATE GUARDIAN BUILD</div></main>`;document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>b.dataset.page==="console"?requestGuildAccess():renderApp(b.dataset.page));document.getElementById("musicToggle").onclick=toggleMusic;const screen=document.getElementById("screen");({orbit:renderOrbit,campaign:renderCampaign,map:renderMap,vault:renderVault,codex:renderCodex,console:renderConsole}[page]||renderOrbit)(screen);hudTimer=setInterval(updateHud,1000)}
function updateHud(){const c=document.getElementById("hudCountdown"),u=document.getElementById("hudUnlockTime");if(!c)return;const a=availability(),ready=isCurrentAvailable(),t=currentTrial();c.textContent=ready?"READY":formatCountdown(a.next);u.textContent=ready?(t?"AVAILABLE":"COMPLETE"):nextUnlockText()}
function renderOrbit(screen){const t=currentTrial(),ready=isCurrentAvailable();screen.innerHTML=`<div class="orbit-hero"><div class="card glass guardian-panel class-accent-${state.class.toLowerCase()}" style="--guardian-art:url('${CLASS_DATA[state.class].art}')"><div class="guardian-watermark"></div><div class="eyebrow">${ICONS.orbit} Guardian Profile</div><div class="guardian-name">${escapeHtml(state.name)}</div><div class="row"><span class="tag">${CLASS_DATA[state.class].icon} ${state.class}</span><span class="tag">${RACE_DATA[state.race].icon} ${state.race}</span><span class="tag">${ICONS.rank} Rank ${Math.floor(state.xp/1000)+1}</span></div><p class="muted" style="margin-top:20px">${t?(ready?`Trial ${String(t.id).padStart(2,"0")} is ready for deployment.`:`Trial ${String(t.id).padStart(2,"0")} remains time-locked.`):"All forty recovery signals have been resolved."}</p></div><div class="card glass"><div class="eyebrow">Guardian Stats</div>${statsMarkup()}</div></div><div class="grid g4" style="margin-top:14px"><div class="card glass metric"><small>${ICONS.campaign} Campaign</small><strong>${percent(state.completed.length)}%</strong><div class="progress"><i style="width:${percent(state.completed.length)}%"></i></div></div><div class="card glass metric"><small>${ICONS.vault} Vault</small><strong>${state.completed.length}/40</strong></div><div class="card glass metric"><small>${ICONS.codex} Codex</small><strong>${state.completed.length}/40</strong></div><div class="card glass metric"><small>${ICONS.glimmer} Glimmer</small><strong>${state.glimmer.toLocaleString()}</strong></div></div><div class="card glass quick-mission" style="margin-top:14px"><div><div class="eyebrow">${ICONS.mission} Quick Start</div><h2>${t?`Trial ${String(t.id).padStart(2,"0")} // Encrypted Relic`:"Campaign Complete"}</h2><p class="muted">${t?(ready?"Authorization granted. Begin the current objective directly from Orbit.":`Unlocks at ${nextUnlockText()} · ${formatCountdown(availability().next)} remaining`):"Final transmission archived."}</p></div>${t?`<button id="quickStart" class="btn primary" ${ready?"":"disabled"}>${ready?"Start Mission":"Time Locked"}</button>`:""}</div>`;if(t&&ready)document.getElementById("quickStart").onclick=()=>{sfx("mission");openMission(t)}}
function renderCampaign(screen){const t=currentTrial(),ready=isCurrentAvailable(),done=TRIALS.filter(x=>state.completed.includes(x.id)),locked=TRIALS.filter(x=>!state.completed.includes(x.id)&&x.id!==t?.id);screen.innerHTML=`${t?`<div class="active-trial glass ${ready?"ready-trial":"locked-trial"}"><div class="eyebrow">${ready?"ACTIVE TRIAL":"TIME-LOCKED"} // ${String(t.id).padStart(2,"0")}</div><div class="trial-title">${ready?"Encrypted Relic":"Signal Pending"}</div><p>${ready?"Complete the skill test and Italian translation to decrypt the assigned recovery container.":`Mission unlocks at <b>${nextUnlockText()}</b>.`}</p><button id="beginMission" class="btn primary" ${ready?"":"disabled"}>${ready?"Begin Mission":"Mission Locked"}</button></div>`:`<div class="active-trial glass"><div class="eyebrow">Campaign Complete</div><div class="trial-title">Forty Trials Cleared</div></div>`}<details><summary>${ICONS.campaign} Completed Missions (${done.length})</summary><div class="detail-body">${done.length?done.map(x=>`<div class="list-item"><div><b>Trial ${x.id}: ${x.reward}</b><br><small class="muted">${x.rcLabel} · ${sourceLabel(x)}</small></div><span class="badge ${rarityClass(x.rarity)}">${x.rarity}</span></div>`).join(""):"<p>No completed missions.</p>"}</div></details><details><summary>${ICONS.lock} Classified Missions (${locked.length})</summary><div class="detail-body">${locked.map(x=>`<div class="list-item"><div><b>Trial ${String(x.id).padStart(2,"0")}</b><br><small class="muted">RC assignment encrypted</small></div><span class="badge">Classified</span></div>`).join("")}</div></details>`;if(t&&ready)document.getElementById("beginMission").onclick=()=>{sfx("mission");openMission(t)}}
function openMission(t){const [q,answers,correct]=t.question,[phrase,pron,meaning]=t.phrase;const modal=document.createElement("div");modal.className="modal";modal.innerHTML=`<div class="modal-box glass"><div class="eyebrow">Trial ${String(t.id).padStart(2,"0")} // Decryption Phase 01</div><h2>Guardian Challenge</h2><p>${q}</p>${answers.map((a,i)=>`<button class="option" data-answer="${i}">${String.fromCharCode(65+i)}. ${a}</button>`).join("")}<button class="btn ghost exit-mission">Exit Mission</button></div>`;document.body.appendChild(modal);modal.querySelector(".exit-mission").onclick=()=>modal.remove();modal.querySelectorAll("[data-answer]").forEach(b=>b.onclick=()=>{if(+b.dataset.answer===correct){b.classList.add("correct");sfx("success");setTimeout(()=>showItalianPhase(modal,t,phrase,pron,meaning),350)}else{b.classList.add("wrong");sfx("error");toast("Incorrect. Recalibrate and try again.")}})}
function showItalianPhase(modal,t,phrase,pron,meaning){const options=[meaning,"See you tomorrow.","You are late.","Good night."].map(v=>[Math.random(),v]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);modal.querySelector(".modal-box").innerHTML=`<div class="eyebrow">Trial ${String(t.id).padStart(2,"0")} // Decryption Phase 02</div><h2>Italian Translation</h2><div class="italian-line"><div><div class="italian">${phrase}</div><div class="pronunciation">${pron}</div></div><button id="hearItalian" class="audio-pronounce">▷ Hear it</button></div><h3>Select the correct meaning</h3>${options.map(v=>`<button class="option" data-language="${v===meaning}">${v}</button>`).join("")}<button id="needHelp" class="help-button">Need help?</button><div id="helpMessage" class="help-line hidden">Call your Italian Language Specialist: Mom.</div><button class="btn ghost exit-mission">Exit Mission</button>`;modal.querySelector(".exit-mission").onclick=()=>modal.remove();document.getElementById("hearItalian").onclick=()=>speakItalian(phrase);document.getElementById("needHelp").onclick=()=>{document.getElementById("helpMessage").classList.toggle("hidden");ghostSay("help",true)};modal.querySelectorAll("[data-language]").forEach(b=>b.onclick=()=>{if(b.dataset.language==="true"){b.classList.add("correct");sfx("success");setTimeout(()=>showRCReveal(modal,t),350)}else{b.classList.add("wrong");sfx("error");toast("Translation unsuccessful.")}})}
function showRCReveal(modal,t){modal.querySelector(".modal-box").innerHTML=`<div class="rc-reveal"><div class="eyebrow">Recovery Assignment Decrypted</div><h1>${getRcLabel(t)}</h1><p>${t.sourceType==="depot"?"Proceed to the Loot Depot and locate the container carrying this exact RC label.":t.sourceType==="sector"?`Proceed to encrypted sector <b>${t.sector}</b> and locate the container carrying this RC label.`:"Await delivery from Guild Master Angel. Confirm the RC label before continuing."}</p><div class="directive"><span>LOCATION</span><b>${sourceLabel(t)}</b></div><button id="containerRetrieved" class="btn primary">Container Retrieved</button><button class="btn ghost exit-mission">Exit Mission</button></div>`;sfx("reveal");modal.querySelector(".exit-mission").onclick=()=>modal.remove();document.getElementById("containerRetrieved").onclick=()=>showCodeEntry(modal,t)}
function showReward(modal,t){modal.querySelector(".modal-box").innerHTML=`<div class="reward-reveal ${rarityClass(t.rarity)}"><div class="reward-rays"></div><img class="reward-vector" src="assets/icons/${t.iconKey}.svg" alt=""><div class="eyebrow">Relic Decrypted // ${getRcLabel(t)}</div><h1>${t.reward}</h1><span class="badge ${rarityClass(t.rarity)}">${t.rarity}</span><p>+${t.xp} XP ${t.glimmer?`· +${t.glimmer.toLocaleString()} Glimmer`:""}</p><button id="claimReward" class="btn primary">Add to Vault</button></div>`;sfx("reveal");document.getElementById("claimReward").onclick=()=>completeTrial(modal,t)}
function renderMap(screen){const nodes={Alpha:[500,70],Bravo:[700,190],Delta:[300,260],Kilo:[670,390],Charlie:[500,450],Lima:[270,590],Golf:[730,590],Echo:[150,770],Foxtrot:[370,770],Juliet:[650,770],Hotel:[850,770],India:[850,950]};const lines=[["Alpha","Charlie"],["Bravo","Charlie"],["Delta","Charlie"],["Kilo","Charlie"],["Charlie","Lima"],["Charlie","Golf"],["Lima","Echo"],["Lima","Foxtrot"],["Golf","Juliet"],["Golf","Hotel"],["Hotel","India"]];screen.innerHTML=`<div class="card glass condo-map-card"><div class="eyebrow">${ICONS.map} Tactical Condo Map</div><h2>Encrypted Sector Network</h2><p class="muted">Sector codenames are uncovered only after a mission sends the Guardian there. No real room names are stored or displayed.</p><div class="condo-map-wrap"><svg class="condo-map" viewBox="0 0 1000 1040"><defs><filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${lines.map(([a,b])=>`<line x1="${nodes[a][0]}" y1="${nodes[a][1]}" x2="${nodes[b][0]}" y2="${nodes[b][1]}" class="map-line"/>`).join("")}${Object.entries(nodes).map(([s,[x,y]])=>{const status=sectorState(s),revealed=status==="visited"||status==="current";return `<g class="map-node ${status}" transform="translate(${x},${y})"><circle r="54"/><circle r="43" class="inner"/><text class="node-icon" y="-7">${revealed?SECTORS[s].icon:"⌁"}</text><text class="node-code" y="18">${revealed?s:"???"}</text><text class="node-name" y="76">${revealed?SECTOR_LORE_NAMES[s]:"ENCRYPTED"}</text></g>`}).join("")}</svg></div><div class="map-legend"><span><i class="dot current"></i> Active</span><span><i class="dot visited"></i> Discovered</span><span><i class="dot locked"></i> Encrypted</span></div></div>`}
function renderVault(screen){const unlocked=TRIALS.filter(t=>state.completed.includes(t.id)),cats=["Credits","Equipment","Provisions","Vouchers","Miscellaneous"];screen.innerHTML=`<div class="eyebrow">${ICONS.vault} Recovered Inventory</div><h2>Vault</h2>${cats.map(cat=>`<details ${unlocked.some(t=>t.category===cat)?"open":""}><summary>${ICONS[cat]} ${cat}</summary><div class="detail-body grid g3">${unlocked.filter(t=>t.category===cat).map(t=>`<div class="vault-card"><img class="vault-vector" src="assets/icons/${t.iconKey}.svg" alt=""><span class="badge ${rarityClass(t.rarity)}">${t.rarity}</span><h3>${t.reward}</h3><small class="muted">${getRcLabel(t)} // ${sourceLabel(t)}</small></div>`).join("")||"<p>No recovered relics.</p>"}</div></details>`).join("")}`}
function renderCodex(screen){const learned=TRIALS.filter(t=>state.completed.includes(t.id));screen.innerHTML=`<div class="card glass"><div class="eyebrow">${ICONS.codex} Italian Language Archive</div><h2>Codex</h2><p class="muted">${learned.length}/40 fragments decrypted.</p>${learned.length?learned.map(t=>`<div class="codex-entry"><div><b>${t.phrase[0]}</b><br><span class="pronunciation">${t.phrase[1]}</span><br><small>${t.phrase[2]}</small></div><button class="audio-pronounce" data-speak="${escapeHtml(t.phrase[0])}">▷ Hear</button></div>`).join(""):"<div class='empty-state'>No language fragments recovered yet.</div>"}</div>`;screen.querySelectorAll("[data-speak]").forEach(b=>b.onclick=()=>speakItalian(b.dataset.speak))}

/* ===== V8 FINAL-BUILD OVERRIDES ===== */
const V8_SECTOR_NAMES=Object.keys(SECTORS);
function applyTrialOverrides(){
  TRIALS.forEach(t=>{
    const o=state.trialOverrides?.[t.id]||{};
    if(typeof o.reward==="string"&&o.reward.trim())t.reward=o.reward.trim();
    if(["Common","Uncommon","Rare","Legendary","Exotic"].includes(o.rarity))t.rarity=o.rarity;
    if(["Credits","Equipment","Provisions","Vouchers","Miscellaneous"].includes(o.category))t.category=o.category;
    if(["depot","sector","npc","guild"].includes(o.sourceType))t.sourceType=o.sourceType;
    if(typeof o.sector==="string"&&V8_SECTOR_NAMES.includes(o.sector))t.sector=o.sector;
    if(typeof o.hideSpot==="string")t.hideSpot=o.hideSpot;
    if(t.sourceType!=="sector")t.sector=null;
  });
}
applyTrialOverrides();

function sourceLabel(t){
  if(t.sourceType==="depot")return "LOOT DEPOT";
  if(t.sourceType==="npc")return "NPC DELIVERY // SATURDAY 5:00 PM";
  if(t.sourceType==="guild")return t.reward==="Dinner Coupon"?"GUILD MASTER // SATURDAY 6:00 PM":"GUILD MASTER DELIVERY";
  return `SECTOR ${t.sector}`;
}
function visualStatValue(raw){
  // Start modestly and climb through the campaign instead of appearing nearly maxed at Trial 01.
  const progressBoost=Math.round((state.completed.length/40)*46);
  const earnedBoost=Math.round(Math.min(raw,60)*0.35);
  return Math.min(100,42+progressBoost+earnedBoost);
}
function statsMarkup(){
  return Object.entries(totalStats()).map(([key,value])=>{const shown=visualStatValue(value);return `<div class="stat"><span>${key}</span><div class="progress"><i style="width:${shown}%"></i></div><b>${shown}</b></div>`}).join("");
}
function hudMarkup(){
  const t=currentTrial(),a=availability(),ready=isCurrentAvailable();
  return `<section class="integrated-hud glass">
    <div class="hud-brand"><span class="hud-class" style="color:${CLASS_DATA[state.class].color}">${CLASS_DATA[state.class].icon}</span><div><b>${escapeHtml(state.name)}</b><small>${state.class} // ${state.race}</small></div></div>
    <div class="hud-stat"><small>RANK</small><b>${Math.floor(state.xp/1000)+1}</b></div>
    <div class="hud-stat"><small>MISSION</small><b>${t?t.id:40}/40</b></div>
    <div class="hud-stat hud-glimmer"><small>GLIMMER</small><b>${state.glimmer.toLocaleString()}</b></div>
    <div class="hud-time"><small>${ready?"STATUS":"UNLOCKS AT"}</small><b id="hudUnlockTime">${ready?(t?"AVAILABLE":"COMPLETE"):nextUnlockText()}</b><span id="hudCountdown">${ready?"READY":formatCountdown(a.next)}</span></div>
  </section>`;
}

function launchBirthdayEasterEgg(){
  const existing=document.getElementById("birthdayEasterEgg");
  if(existing)existing.remove();
  const wrap=document.createElement("div");
  wrap.id="birthdayEasterEgg";
  wrap.className="birthday-easter";
  wrap.innerHTML=`
    <button class="birthday-close" aria-label="Close birthday surprise">×</button>
    <div class="birthday-fireworks" aria-hidden="true"></div>
    <div class="birthday-content">
      <div class="birthday-mini-logo"><span class="relic-logo-shape"></span></div>
      <div class="birthday-kicker">SECRET TRANSMISSION UNLOCKED</div>
      <div class="birthday-title">HAPPY BIRTHDAY</div>
      <div class="birthday-name">${escapeHtml(state.name)}</div>
      <div class="birthday-sub">Eyes up, Guardian. Today is yours.</div>
    </div>`;
  document.body.appendChild(wrap);
  const fireworks=wrap.querySelector(".birthday-fireworks");
  for(let i=0;i<7;i++){
    const burst=document.createElement("div");
    burst.className="firework-burst";
    burst.style.setProperty("--fx",`${10+Math.random()*80}%`);
    burst.style.setProperty("--fy",`${10+Math.random()*65}%`);
    burst.style.setProperty("--fd",`${Math.random()*1.6}s`);
    for(let j=0;j<18;j++){
      const p=document.createElement("i");
      p.style.setProperty("--a",`${j*20}deg`);
      p.style.setProperty("--r",`${48+Math.random()*72}px`);
      burst.appendChild(p);
    }
    fireworks.appendChild(burst);
  }
  try{sfx("reveal")}catch(e){}
  wrap.querySelector(".birthday-close").onclick=()=>wrap.remove();
}
function bindRelicLogoEasterEgg(){
  const logo=document.getElementById("relicLogoEgg");
  if(!logo)return;
  let taps=0,timer=null;
  const hit=()=>{
    taps++;
    clearTimeout(timer);
    timer=setTimeout(()=>taps=0,1300);
    if(taps>=3){taps=0;clearTimeout(timer);launchBirthdayEasterEgg()}
  };
  logo.addEventListener("click",hit);
}

function renderApp(page=currentPage){
  currentPage=page;state.phase="app";saveState();clearInterval(hudTimer);
  const navPages=["orbit","campaign","map","vault","codex","console"];
  app.innerHTML=`<main class="shell"><header class="topbar glass"><div class="brand"><button id="relicLogoEgg" class="relic-logo-egg" aria-label="Relic Protocol insignia"><span class="relic-logo-shape"></span></button><div>Relic Protocol<small>Guild Headquarters Network</small></div></div><nav class="nav">${navPages.map(n=>`<button data-page="${n}" class="${n===page?"active":""}"><span>${ICONS[n]}</span><em>${n==="console"?"Guild Master":n}</em></button>`).join("")}<div class="audio-controls"><button id="musicPlayPause" class="sound-toggle compact-sound" title="Play or pause background music" aria-label="Play or pause background music">${musicOn?"⏸":"▶"}</button><button id="musicToggle" class="sound-toggle compact-sound" title="Mute or unmute background music" aria-label="Mute or unmute background music">${musicOn?"🔊":"🔇"}</button><input id="musicVolume" class="music-volume" type="range" min="0" max="6" step="0.5" value="${Math.round((state.musicVolume??.02)*100)}" aria-label="Background music volume"></div></nav></header>${hudMarkup()}<section id="screen" class="screen active"></section><div class="footer-note">THE RELIC PROTOCOL // PRIVATE GUARDIAN BUILD</div></main>`;
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>b.dataset.page==="console"?requestGuildAccess():renderApp(b.dataset.page));bindRelicLogoEasterEgg();
  document.getElementById("musicToggle").onclick=()=>{toggleMusic();document.getElementById("musicToggle").textContent=musicOn?"🔊":"🔇";const pp=document.getElementById("musicPlayPause");if(pp)pp.textContent=musicOn?"⏸":"▶"};const playPause=document.getElementById("musicPlayPause");if(playPause){playPause.onclick=()=>{ensureAudio();if(!ambientTrack)startAmbient();if(!ambientTrack)return;if(ambientTrack.paused){musicOn=true;ambientTrack.volume=Math.max(0,Math.min(.1,state.musicVolume??.02));ambientTrack.play().catch(()=>{});playPause.textContent="⏸";document.getElementById("musicToggle").textContent="🔊"}else{ambientTrack.pause();musicOn=false;playPause.textContent="▶";document.getElementById("musicToggle").textContent="🔇"}}};const volumeSlider=document.getElementById("musicVolume");if(volumeSlider){volumeSlider.oninput=()=>{state.musicVolume=Number(volumeSlider.value)/100;if(ambientTrack)ambientTrack.volume=state.musicVolume;saveState()}};
  const screen=document.getElementById("screen");({orbit:renderOrbit,campaign:renderCampaign,map:renderMap,vault:renderVault,codex:renderCodex,console:renderConsole}[page]||renderOrbit)(screen);hudTimer=setInterval(updateHud,1000);
}
function renderOrbit(screen){
  const t=currentTrial(),ready=isCurrentAvailable();
  screen.innerHTML=`
  <div class="card glass quick-mission quick-mission-top">
    <div>
      <div class="eyebrow">${ICONS.mission} Quick Start</div>
      <h2>${t?`Trial ${String(t.id).padStart(2,"0")} // Encrypted Relic`:"Campaign Complete"}</h2>
      <p class="muted">${t?(ready?"Authorization granted. Begin the current objective directly from Orbit.":`Unlocks at ${nextUnlockText()} · ${formatCountdown(availability().next)} remaining`):"Final transmission archived."}</p>
    </div>
    ${t?`<button id="quickStart" class="btn primary" ${ready?"":"disabled"}>${ready?"Start Mission":"Time Locked"}</button>`:""}
  </div>
  <div class="orbit-hero">
    <div class="card glass guardian-panel class-accent-${state.class.toLowerCase()}" style="--guardian-art:url('${CLASS_DATA[state.class].art}')">
      <div class="profile-avatar-wrap"><img class="guardian-emblem" src="${CLASS_DATA[state.class].art}" alt="${state.class} emblem"></div>
      <div class="eyebrow">${ICONS.orbit} Guardian Profile</div>
      <div class="guardian-name">${escapeHtml(state.name)}</div>
      <div class="row">
        <span class="tag">${CLASS_DATA[state.class].icon} ${state.class}</span>
        <span class="tag">${RACE_DATA[state.race].icon} ${state.race}</span>
        <span class="tag">${ICONS.rank} Rank ${Math.floor(state.xp/1000)+1}</span>
      </div>
      <p class="muted" style="margin-top:20px">${t?(ready?`Trial ${String(t.id).padStart(2,"0")} is ready for deployment.`:`Trial ${String(t.id).padStart(2,"0")} remains time-locked.`):"All forty recovery signals have been resolved."}</p>
    </div>
    <div class="card glass"><div class="eyebrow">Guardian Stats</div>${statsMarkup()}</div>
  </div>
  <div class="grid g4 orbit-shortcuts" style="margin-top:14px">
    <button class="card glass metric orbit-link-card" data-orbit-link="campaign"><small>${ICONS.campaign} Campaign</small><strong>${percent(state.completed.length)}%</strong><div class="progress"><i style="width:${percent(state.completed.length)}%"></i></div></button>
    <button class="card glass metric orbit-link-card" data-orbit-link="vault"><small>${ICONS.vault} Vault</small><strong>${state.completed.length}/40</strong></button>
    <button class="card glass metric orbit-link-card" data-orbit-link="codex"><small>${ICONS.codex} Codex</small><strong>${state.completed.length}/40</strong></button>
    <div class="card glass metric"><small>${ICONS.glimmer} Glimmer</small><strong>${state.glimmer.toLocaleString()}</strong></div>
  </div>`;
  if(t&&ready)document.getElementById("quickStart").onclick=()=>{sfx("mission");openMission(t,false)};
  screen.querySelectorAll("[data-orbit-link]").forEach(card=>card.onclick=()=>renderApp(card.dataset.orbitLink));
}
function renderCampaign(screen){
  const t=currentTrial(),ready=isCurrentAvailable(),done=TRIALS.filter(x=>state.completed.includes(x.id)),locked=TRIALS.filter(x=>!state.completed.includes(x.id)&&x.id!==t?.id);
  screen.innerHTML=`${t?`<div class="active-trial glass ${ready?"ready-trial":"locked-trial"}"><div class="eyebrow">${ready?"ACTIVE TRIAL":"TIME-LOCKED"} // ${String(t.id).padStart(2,"0")}</div><div class="trial-title">${ready?"Encrypted Relic":"Signal Pending"}</div><p>${ready?"Complete the skill test and language translation to decrypt the assigned recovery route.":`Mission unlocks at <b>${nextUnlockText()}</b>.`}</p><button id="beginMission" class="btn primary" ${ready?"":"disabled"}>${ready?"Begin Mission":"Mission Locked"}</button></div>`:`<div class="active-trial glass"><div class="eyebrow">Campaign Complete</div><div class="trial-title">Forty Trials Cleared</div></div>`}<details open><summary>${ICONS.campaign} Completed Missions (${done.length})</summary><div class="detail-body">${done.length?done.map(x=>`<div class="list-item campaign-complete-row"><div><b>Trial ${String(x.id).padStart(2,"0")}: ${escapeHtml(x.reward)}</b><br><small class="muted">${x.rcLabel} · ${sourceLabel(x)}</small></div><div class="row"><span class="badge ${rarityClass(x.rarity)}">${x.rarity}</span><button class="btn ghost mini replay-trial" data-replay="${x.id}">Replay</button></div></div>`).join(""):"<p>No completed missions.</p>"}</div></details><details><summary>${ICONS.lock} Classified Missions (${locked.length})</summary><div class="detail-body">${locked.map(x=>`<div class="list-item"><div><b>Trial ${String(x.id).padStart(2,"0")}</b><br><small class="muted">RC assignment encrypted</small></div><span class="badge">Classified</span></div>`).join("")}</div></details>`;
  if(t&&ready)document.getElementById("beginMission").onclick=()=>{sfx("mission");openMission(t,false)};
  screen.querySelectorAll("[data-replay]").forEach(b=>b.onclick=()=>openMission(TRIALS[+b.dataset.replay-1],true));
}
function languageKnown(){return state.completed.length>=10}

function challengeForTrial(t){
  // Ice Cream Date Voucher always opens with Angel's ice-cream question.
  if((t.reward||"").toLowerCase().includes("ice cream")){
    return CHALLENGES.find(q=>q[0].includes("favourite ice cream")) || t.question;
  }
  return t.question;
}
function differentChallenge(previous){
  const pool=CHALLENGES.filter(q=>q!==previous && q[0]!==previous?.[0]);
  return pool[Math.floor(Math.random()*pool.length)] || previous;
}

function finishPuzzle(modal,t,replay=false){
  sfx("success");
  const [phrase,pron,meaning]=t.phrase;
  setTimeout(()=>showItalianPhase(modal,t,phrase,pron,meaning,replay),320);
}
function renderSignalSequencePuzzle(modal,t,replay=false){
  const pads=["◆","●","▲","■"];
  const sequence=Array.from({length:4},()=>Math.floor(Math.random()*4));
  let input=[],locked=true;
  modal.querySelector(".modal-box").innerHTML=`
    <div class="eyebrow">Trial ${String(t.id).padStart(2,"0")} // ${replay?"REPLAY // ":""}Signal Calibration</div>
    <h2>Echo the Ghost Signal</h2>
    <p class="muted">Watch the four-pulse sequence, then repeat it.</p>
    <div class="signal-grid">${pads.map((p,i)=>`<button class="signal-pad" data-pad="${i}">${p}</button>`).join("")}</div>
    <button id="replaySignal" class="btn">Replay Signal</button>
    <button class="btn ghost exit-mission">Exit Mission</button>`;
  const padsEls=[...modal.querySelectorAll(".signal-pad")];
  const flash=()=>{
    locked=true;input=[];
    padsEls.forEach(x=>x.disabled=true);
    sequence.forEach((idx,n)=>setTimeout(()=>{padsEls[idx].classList.add("lit");sfx("click");setTimeout(()=>padsEls[idx].classList.remove("lit"),230)},350+n*520));
    setTimeout(()=>{locked=false;padsEls.forEach(x=>x.disabled=false)},350+sequence.length*520);
  };
  modal.querySelector(".exit-mission").onclick=()=>modal.remove();
  document.getElementById("replaySignal").onclick=flash;
  padsEls.forEach(el=>el.onclick=()=>{
    if(locked)return;
    const v=+el.dataset.pad;input.push(v);el.classList.add("lit");setTimeout(()=>el.classList.remove("lit"),150);
    const idx=input.length-1;
    if(v!==sequence[idx]){
      sfx("error");ghostSay("wrong",true);toast("Signal lost. New sequence generated...");
      setTimeout(()=>renderSignalSequencePuzzle(modal,t,replay),600);return;
    }
    if(input.length===sequence.length)finishPuzzle(modal,t,replay);
  });
  setTimeout(flash,450);
}
function renderGlyphOrderPuzzle(modal,t,replay=false){
  const values=[1,2,3,4,5].sort(()=>Math.random()-.5);
  let next=1;
  modal.querySelector(".modal-box").innerHTML=`
    <div class="eyebrow">Trial ${String(t.id).padStart(2,"0")} // ${replay?"REPLAY // ":""}Orbital Alignment</div>
    <h2>Stabilize the Relay</h2>
    <p class="muted">Tap the orbital nodes from lowest signal to highest.</p>
    <div class="glyph-grid">${values.map(v=>`<button class="glyph-node" data-glyph="${v}"><span>${["◇","✦","⬡","◈","✧"][v-1]}</span><b>${v}</b></button>`).join("")}</div>
    <button class="btn ghost exit-mission">Exit Mission</button>`;
  modal.querySelector(".exit-mission").onclick=()=>modal.remove();
  modal.querySelectorAll(".glyph-node").forEach(el=>el.onclick=()=>{
    const v=+el.dataset.glyph;
    if(v!==next){
      sfx("error");ghostSay("wrong",true);toast("Alignment failed. Relay reshuffling...");
      setTimeout(()=>renderGlyphOrderPuzzle(modal,t,replay),550);return;
    }
    el.classList.add("solved");el.disabled=true;sfx("click");next++;
    if(next===6)finishPuzzle(modal,t,replay);
  });
}
function shouldUseMiniGame(t){
  // Keep personal/special questions intact; sprinkle puzzles through the campaign.
  if((t.reward||"").toLowerCase().includes("ice cream"))return false;
  return t.id%6===0 || t.id%7===0;
}
function renderMissionChallenge(modal,t,replay=false){
  if(shouldUseMiniGame(t)){
    if(t.id%2===0)renderSignalSequencePuzzle(modal,t,replay);
    else renderGlyphOrderPuzzle(modal,t,replay);
  }else{
    renderChallengePhase(modal,t,challengeForTrial(t),replay);
  }
}

function renderChallengePhase(modal,t,challenge,replay=false){
  const [q,answers,correct]=challenge;
  modal.querySelector(".modal-box").innerHTML=
    `<div class="eyebrow">Trial ${String(t.id).padStart(2,"0")} // ${replay?"REPLAY // ":""}Decryption Phase 01</div>
     <h2>Guardian Challenge</h2>
     <p>${q}</p>
     ${answers.map((a,i)=>`<button class="option" data-answer="${i}">${String.fromCharCode(65+i)}. ${a}</button>`).join("")}
     <button class="btn ghost exit-mission">Exit Mission</button>`;
  modal.querySelector(".exit-mission").onclick=()=>modal.remove();
  modal.querySelectorAll("[data-answer]").forEach(b=>b.onclick=()=>{
    if(+b.dataset.answer===correct){
      b.classList.add("correct");
      sfx("success");
      const [phrase,pron,meaning]=t.phrase;
      setTimeout(()=>showItalianPhase(modal,t,phrase,pron,meaning,replay),250);
    }else{
      b.classList.add("wrong");
      sfx("error");
      ghostSay("wrong",true);
      toast("Incorrect. New challenge loading...");
      const next=differentChallenge(challenge);
      setTimeout(()=>renderChallengePhase(modal,t,next,replay),650);
    }
  });
}

function openMission(t,replay=false){
  const modal=document.createElement("div");
  modal.className="modal";
  modal.dataset.replay=replay?"1":"0";
  modal.innerHTML=`<div class="modal-box glass"></div>`;
  document.body.appendChild(modal);
  setTimeout(()=>ghostSay(t.sourceType==="sector"?"sector":"mission",true),220);
  renderMissionChallenge(modal,t,replay);
}
function showItalianPhase(modal,t,phrase,pron,meaning,replay=false){
  const options=[meaning,"See you tomorrow.","You are late.","Good night."].map(v=>[Math.random(),v]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);const known=languageKnown();
  modal.querySelector(".modal-box").innerHTML=`<div class="eyebrow">Trial ${String(t.id).padStart(2,"0")} // ${replay?"REPLAY // ":""}Decryption Phase 02</div><h2>${known?"Italian":"Encrypted Language"} Translation</h2><div class="italian-line"><div><div class="italian">${phrase}</div><div class="pronunciation">${pron}</div></div><button id="hearItalian" class="audio-pronounce">▷ Hear it</button></div><h3>Select the correct meaning</h3>${options.map(v=>`<button class="option" data-language="${v===meaning}">${v}</button>`).join("")}<button id="needHelp" class="help-button">Need help?</button><div id="helpMessage" class="help-line hidden">Call your ${known?"Italian ":""}Language Specialist: Mom.</div><button class="btn ghost exit-mission">Exit Mission</button>`;
  modal.querySelector(".exit-mission").onclick=()=>modal.remove();document.getElementById("hearItalian").onclick=()=>speakItalian(phrase);document.getElementById("needHelp").onclick=()=>{document.getElementById("helpMessage").classList.toggle("hidden");ghostSay("help",true)};modal.querySelectorAll("[data-language]").forEach(b=>b.onclick=()=>{if(b.dataset.language==="true"){b.classList.add("correct");sfx("success");setTimeout(()=>showRCReveal(modal,t,replay),250)}else{b.classList.add("wrong");sfx("error");toast("Translation unsuccessful.")}});
}
function showRCReveal(modal,t,replay=false){
  let direction="";
  if(t.sourceType==="depot")direction="Proceed to the Loot Depot and locate the container carrying this exact RC label.";
  else if(t.sourceType==="sector")direction=`Proceed to <b>Sector ${t.sector}</b>. Search directive: <b>${escapeHtml(t.hideSpot||"Search the designated recovery point")}</b>.`;
  else if(t.sourceType==="npc")direction="Await the authorized NPC delivery at Saturday 5:00 PM.";
  else direction=t.reward==="Dinner Coupon"?"Report to Guild Master Angel at Saturday 6:00 PM.":"Await direct authorization from Guild Master Angel.";
  modal.querySelector(".modal-box").innerHTML=`<div class="rc-reveal"><div class="eyebrow">Recovery Assignment Decrypted ${replay?"// REPLAY":""}</div><h1>${getRcLabel(t)}</h1><p>${direction}</p><div class="directive"><span>LOCATION</span><b>${sourceLabel(t)}</b>${t.sourceType==="sector"&&t.hideSpot?`<small>${escapeHtml(t.hideSpot)}</small>`:""}</div>${t.sourceType==="sector"?`<button id="missionMap" class="btn minor-action">${ICONS.map} View Map</button>`:""}<button id="containerRetrieved" class="btn primary">${t.sourceType==="sector"?"Relic Retrieved":"Container Retrieved"}</button><button class="btn ghost exit-mission">Exit Mission</button></div>`;
  sfx("reveal");modal.querySelector(".exit-mission").onclick=()=>modal.remove();if(t.sourceType==="sector")document.getElementById("missionMap").onclick=()=>openMapOverlay(t.sector);document.getElementById("containerRetrieved").onclick=()=>showCodeEntry(modal,t,replay);
}
function showCodeEntry(modal,trial,replay=false){
  modal.querySelector(".modal-box").innerHTML=`<div class="eyebrow">${ICONS.lock} Recovery Authorization ${replay?"// REPLAY":""}</div><h2>Enter Container Code</h2><p class="muted">Enter the recovery code. Guild Master testing override is also accepted.</p><div class="code-lock"><input id="recoveryCode" maxlength="12" autocomplete="off" placeholder="ENTER CODE"><button id="verifyCode" class="btn primary">Verify</button></div><div id="codeError" class="code-error hidden">ACCESS DENIED // Incorrect recovery code</div><button class="btn ghost exit-mission">Exit Mission</button>`;
  modal.querySelector(".exit-mission").onclick=()=>modal.remove();const verify=()=>{const entered=document.getElementById("recoveryCode").value.trim().toUpperCase();if(entered===getCode(trial).toUpperCase()||entered===String(state.masterOverrideCode||"1006").trim().toUpperCase())showReward(modal,trial,replay);else{ghostSay("badcode",true);document.getElementById("codeError").classList.remove("hidden");document.getElementById("recoveryCode").classList.add("shake");setTimeout(()=>document.getElementById("recoveryCode")?.classList.remove("shake"),450)}};document.getElementById("verifyCode").onclick=verify;document.getElementById("recoveryCode").onkeydown=e=>{if(e.key==="Enter")verify()};document.getElementById("recoveryCode").focus();
}

function rarityFxClass(r){return `fx-${String(r||"common").toLowerCase()}`}
function burstParticles(host,count=18){
  if(!host)return;
  for(let i=0;i<count;i++){
    const p=document.createElement("i");
    p.className="loot-particle";
    const a=(Math.PI*2*i/count)+(Math.random()*.25);
    const d=70+Math.random()*110;
    p.style.setProperty("--x",`${Math.cos(a)*d}px`);
    p.style.setProperty("--y",`${Math.sin(a)*d}px`);
    p.style.setProperty("--delay",`${Math.random()*.18}s`);
    host.appendChild(p);
  }
}
function showMissionCompleteFx(trial){
  const old=document.getElementById("missionCompleteFx");if(old)old.remove();
  const fx=document.createElement("div");fx.id="missionCompleteFx";fx.className=`mission-complete-fx ${rarityFxClass(trial.rarity)}`;
  fx.innerHTML=`<div class="complete-scan"></div><div class="complete-core"><div class="complete-kicker">TRIAL ${String(trial.id).padStart(2,"0")} COMPLETE</div><div class="complete-title">MISSION COMPLETE</div><div class="complete-reward">${escapeHtml(trial.reward)}</div><div class="complete-gains"><span>+${trial.xp} XP</span>${trial.glimmer?`<span>+${trial.glimmer.toLocaleString()} GLIMMER</span>`:""}</div></div>`;
  document.body.appendChild(fx);burstParticles(fx,trial.rarity==="Exotic"?30:trial.rarity==="Legendary"?24:16);
  sfx("success");ghostSay(trial.rarity==="Exotic"||trial.rarity==="Legendary"?trial.rarity:"correct",true);
  setTimeout(()=>fx.classList.add("depart"),2100);
  setTimeout(()=>fx.remove(),2850);
}

function showReward(modal,t,replay=false){
  modal.querySelector(".modal-box").innerHTML=`<div class="reward-reveal ${rarityClass(t.rarity)}"><div class="reward-rays"></div><img class="reward-vector" src="assets/icons/${t.iconKey}.svg" alt=""><div class="eyebrow">Relic Decrypted // ${getRcLabel(t)}${replay?" // REPLAY":""}</div><h1>${escapeHtml(t.reward)}</h1><span class="badge ${rarityClass(t.rarity)}">${t.rarity}</span>${replay?`<p class="muted">Replay complete. No XP, Glimmer, stats, or duplicate Vault item awarded.</p><button id="closeReplay" class="btn primary">Close Replay</button>`:`<p>+${t.xp} XP ${t.glimmer?`· +${t.glimmer.toLocaleString()} Glimmer`:""}</p><button id="claimReward" class="btn primary">Add to Vault</button>`}</div>`;const rewardEl=modal.querySelector(".reward-reveal");rewardEl?.classList.add(rarityFxClass(t.rarity));burstParticles(rewardEl,t.rarity==="Exotic"?28:t.rarity==="Legendary"?22:t.rarity==="Rare"?16:10);sfx("reveal");ghostSay(t.rarity,true);if(replay)document.getElementById("closeReplay").onclick=()=>modal.remove();else document.getElementById("claimReward").onclick=()=>completeTrial(modal,t);
}
const SECTOR_LORE_NAMES={
  Alpha:"Resting Headquarters",
  Bravo:"Textile Reserve",
  Charlie:"Central Junction",
  Delta:"Sanitation Bay",
  Echo:"Recreation Annex",
  Foxtrot:"Operations Center",
  Golf:"Provisions",
  Hotel:"Outer Wardrobe",
  Juliet:"Maintenance Annex",
  Kilo:"Hobby Archive",
  Lima:"Mess Hall"
};

function sectorRecoveredItems(sector){
  return TRIALS.filter(t=>t.sector===sector && state.completed.includes(t.id));
}
function sectorCurrentItem(sector){
  const t=currentTrial();
  return t && t.sector===sector && isCurrentAvailable() ? t : null;
}
function sectorDetailMarkup(sector){
  const status=sectorState(sector);
  const revealed=status==="visited"||status==="current";
  if(!revealed){
    return `<div class="sector-detail encrypted-detail">
      <div class="eyebrow">SECTOR ENCRYPTED</div>
      <h3>Unknown Location</h3>
      <p class="muted">Complete a mission routed to this sector to decrypt its archive.</p>
    </div>`;
  }
  const recovered=sectorRecoveredItems(sector);
  const active=sectorCurrentItem(sector);
  return `<div class="sector-detail">
    <div class="sector-detail-head">
      <div>
        <div class="eyebrow">SECTOR ${sector}</div>
        <h3>${SECTOR_LORE_NAMES[sector]}</h3>
      </div>
      <span class="sector-count">${recovered.length} recovered</span>
    </div>
    ${active?`<div class="sector-active-item"><small>ACTIVE SIGNAL</small><b>Trial ${String(active.id).padStart(2,"0")}</b><span>${escapeHtml(active.hideSpot||"Search directive encrypted")}</span></div>`:""}
    <div class="sector-found-list">
      ${recovered.length?recovered.map(t=>`<div class="sector-found-item">
        <img src="assets/icons/${t.iconKey}.svg" alt="">
        <div><b>${escapeHtml(t.reward)}</b><small>${getRcLabel(t)} · ${t.rarity}</small></div>
      </div>`).join(""):`<p class="muted">No relics recovered from this sector yet.</p>`}
    </div>
  </div>`;
}
function mapMarkup(focusSector=null){
  /* Lima removed because no current reward uses it.
     Echo and Foxtrot now route directly through Charlie. */
  const nodes={
    Alpha:[500,70],
    Bravo:[275,205],
    Delta:[725,205],
    Kilo:[820,390],
    Charlie:[500,390],
    Echo:[210,590],
    Foxtrot:[405,690],
    Golf:[710,590],
    Juliet:[625,800],
    Hotel:[825,800]
  };
  const lines=[
    ["Alpha","Charlie"],
    ["Bravo","Charlie"],
    ["Delta","Charlie"],
    ["Kilo","Charlie"],
    ["Charlie","Echo"],
    ["Charlie","Foxtrot"],
    ["Charlie","Golf"],
    ["Golf","Juliet"],
    ["Golf","Hotel"]
  ];
  return `<div class="interactive-map-shell">
    <div class="condo-map-wrap">
      <svg class="condo-map interactive-condo-map" viewBox="0 0 1000 900" role="img" aria-label="Interactive tactical sector network">
        <defs>
          <filter id="glow"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <linearGradient id="mapLineGlow" x1="0" x2="1"><stop offset="0" stop-color="#64dcff" stop-opacity=".12"/><stop offset=".5" stop-color="#64dcff" stop-opacity=".48"/><stop offset="1" stop-color="#b997ff" stop-opacity=".14"/></linearGradient>
        </defs>
        ${lines.map(([a,b])=>`<line x1="${nodes[a][0]}" y1="${nodes[a][1]}" x2="${nodes[b][0]}" y2="${nodes[b][1]}" class="map-line"/>`).join("")}
        ${Object.entries(nodes).map(([s,[x,y]])=>{
          const status=focusSector===s?"current":sectorState(s);
          const revealed=status==="visited"||status==="current";
          const count=sectorRecoveredItems(s).length;
          return `<g class="map-node map-node-clickable ${status}" data-map-sector="${s}" transform="translate(${x},${y})" role="button" aria-label="${revealed?`Sector ${s}, ${SECTOR_LORE_NAMES[s]}, ${count} recovered`:`Encrypted sector`}">
            <circle r="58" class="node-pulse"/>
            <circle r="50"/>
            <circle r="39" class="inner"/>
            <text class="node-icon" y="-9">${revealed?SECTORS[s].icon:"⌁"}</text>
            <text class="node-code" y="17">${revealed?s:"???"}</text>
            <text class="node-name" y="74">${revealed?SECTOR_LORE_NAMES[s]:"ENCRYPTED"}</text>
            ${revealed&&count?`<g class="map-count-badge" transform="translate(38,-38)"><circle r="14"/><text y="4">${count}</text></g>`:""}
          </g>`;
        }).join("")}
      </svg>
    </div>
    <div class="map-detail-slot" data-map-detail>
      <div class="sector-detail map-instruction">
        <div class="eyebrow">TACTICAL ARCHIVE</div>
        <h3>Select a Sector</h3>
        <p class="muted">Tap any decrypted location to review the relics recovered there.</p>
      </div>
    </div>
  </div>`;
}
function bindInteractiveMap(root){
  const detail=root.querySelector("[data-map-detail]");
  root.querySelectorAll("[data-map-sector]").forEach(node=>{
    node.addEventListener("click",()=>{
      const sector=node.dataset.mapSector;
      root.querySelectorAll("[data-map-sector]").forEach(n=>n.classList.toggle("selected",n===node));
      if(detail)detail.innerHTML=sectorDetailMarkup(sector);
      try{sfx("click")}catch(e){}
    });
  });
}
function openMapOverlay(focusSector){
  const overlay=document.createElement("div");
  overlay.className="modal map-modal";
  overlay.innerHTML=`<div class="modal-box glass map-modal-box">
    <div class="eyebrow">${ICONS.map} Tactical Map</div>
    <h2>${focusSector?`Active Sector // ${focusSector}`:"Sector Network"}</h2>
    <p class="muted map-intro">Select a decrypted sector to review recovered relics.</p>
    ${mapMarkup(focusSector)}
    <button class="btn primary close-map">Return to Mission</button>
  </div>`;
  document.body.appendChild(overlay);
  bindInteractiveMap(overlay);
  if(focusSector){
    const node=overlay.querySelector(`[data-map-sector="${focusSector}"]`);
    node?.dispatchEvent(new Event("click"));
  }
  overlay.querySelector(".close-map").onclick=()=>overlay.remove();
}
function renderMap(screen){
  screen.innerHTML=`<div class="card glass condo-map-card">
    <div class="eyebrow">${ICONS.map} Tactical Map</div>
    <h2>Guild Headquarters Sector Network</h2>
    <p class="muted map-intro">Decrypted sectors remember what you recovered there. Tap a location to open its archive.</p>
    ${mapMarkup()}
    <div class="map-legend">
      <span><i class="dot current"></i> Active</span>
      <span><i class="dot visited"></i> Discovered</span>
      <span><i class="dot locked"></i> Encrypted</span>
    </div>
  </div>`;
  bindInteractiveMap(screen);
}


function vaultItemCard(t){
  return `<div class="vault-card rarity-card ${rarityClass(t.rarity)}">
    <div class="vault-card-top">
      <img class="vault-vector" src="assets/icons/${t.iconKey}.svg" alt="">
      <span class="badge ${rarityClass(t.rarity)}">${t.rarity}</span>
    </div>
    <h3>${escapeHtml(t.reward)}</h3>
    <div class="vault-meta">
      <span>${ICONS[t.category]||"◫"} ${t.category}</span>
      <span>${getRcLabel(t)}</span>
    </div>
    <small class="muted">${sourceLabel(t)}</small>
  </div>`;
}
function renderVaultGroups(unlocked,mode){
  const rarityOrder=["Exotic","Legendary","Rare","Uncommon","Common"];
  const categoryOrder=["Credits","Equipment","Provisions","Vouchers","Miscellaneous"];
  const rarityIcon={Exotic:"✦",Legendary:"◆",Rare:"◇",Uncommon:"⬢",Common:"•"};
  const groups=mode==="type"?categoryOrder:rarityOrder;
  return groups.map(group=>{
    const items=unlocked.filter(t=>mode==="type"?t.category===group:t.rarity===group);
    const cls=mode==="type"?"type-group":rarityClass(group);
    const icon=mode==="type"?(ICONS[group]||"◫"):rarityIcon[group];
    return `<details class="vault-rarity-group ${cls}" ${items.length?"open":""}>
      <summary>
        <span class="rarity-summary-left"><i>${icon}</i><b>${group}</b></span>
        <span class="rarity-count">${items.length}</span>
      </summary>
      <div class="detail-body grid g3 vault-rarity-grid">
        ${items.length?items.map(vaultItemCard).join(""):`<div class="empty-state">No ${group.toLowerCase()} relics recovered yet.</div>`}
      </div>
    </details>`;
  }).join("");
}
function renderVault(screen){
  const unlocked=TRIALS.filter(t=>state.completed.includes(t.id));
  const rarities=["Exotic","Legendary","Rare","Uncommon","Common"];
  screen.innerHTML=`
    <div class="vault-header-row">
      <div><div class="eyebrow">${ICONS.vault} Recovered Inventory</div><h2>Vault</h2></div>
      <div class="vault-total"><small>RECOVERED</small><b>${unlocked.length}/40</b></div>
    </div>
    <div class="vault-rarity-summary">
      ${rarities.map(r=>`<div class="vault-summary-chip ${rarityClass(r)}"><small>${r}</small><b>${unlocked.filter(t=>t.rarity===r).length}</b></div>`).join("")}
    </div>
    <div class="vault-sort-row">
      <span>SORT INVENTORY</span>
      <div class="vault-sort-toggle">
        <button class="vault-sort-btn active" data-vault-sort="rarity">Rarity</button>
        <button class="vault-sort-btn" data-vault-sort="type">Type</button>
      </div>
    </div>
    <div id="vaultGroups" class="vault-rarity-stack">${renderVaultGroups(unlocked,"rarity")}</div>`;
  const groupHost=screen.querySelector("#vaultGroups");
  screen.querySelectorAll("[data-vault-sort]").forEach(btn=>btn.onclick=()=>{
    screen.querySelectorAll("[data-vault-sort]").forEach(b=>b.classList.toggle("active",b===btn));
    groupHost.innerHTML=renderVaultGroups(unlocked,btn.dataset.vaultSort);
    try{sfx("click")}catch(e){}
  });
}
function renderCodex(screen){const learned=TRIALS.filter(t=>state.completed.includes(t.id)),known=learned.length>=10;screen.innerHTML=`<div class="card glass"><div class="eyebrow">${ICONS.codex} ${known?"Italian":"Unknown"} Language Archive</div><h2>Codex</h2><p class="muted">${learned.length}/40 fragments decrypted.${known?" Language identified: Italian.":" Language identity remains encrypted."}</p>${learned.length?learned.map(t=>`<div class="codex-entry"><div><b>${t.phrase[0]}</b><br><span class="pronunciation">${t.phrase[1]}</span><br><small>${t.phrase[2]}</small></div><button class="audio-pronounce" data-speak="${escapeHtml(t.phrase[0])}">▷ Hear</button></div>`).join(""):"<div class='empty-state'>No language fragments recovered yet.</div>"}</div>`;screen.querySelectorAll("[data-speak]").forEach(b=>b.onclick=()=>speakItalian(b.dataset.speak))}
function sourceCount(type){return TRIALS.filter(t=>t.sourceType===type).length}
function renderConsole(screen){
  const trial=currentTrial();
  screen.innerHTML=`<div class="card glass"><div class="eyebrow">${ICONS.console} Guild Master Angel // Authorized</div><h2>Guild Master Console</h2><div class="console-counts"><span>Loot Depot <b>${sourceCount("depot")}/20</b></span><span>Sector <b>${sourceCount("sector")}/17</b></span><span>NPC <b>${sourceCount("npc")}/1</b></span><span>Guild Master <b>${sourceCount("guild")}/2</b></span><span>Total <b>${TRIALS.length}/40</b></span></div><div class="mode-switch"><button class="mode-option ${state.campaign.mode==="test"?"active":""}" data-mode="test"><b>Trial Test</b><small>Time restrictions disabled</small></button><button class="mode-option ${state.campaign.mode==="live"?"active":""}" data-mode="live"><b>Live Campaign</b><small>Scheduled mission releases</small></button></div><div class="grid g3 settings-grid"><div class="field"><label>Campaign Friday</label><input id="campaignDate" type="date" value="${state.campaign.startDate}"></div><div class="field"><label>Friday/Saturday Window</label><input value="6:00 AM — 8:00 PM" disabled></div><div class="field"><label>Sunday</label><input value="Hourly until Trial 40" disabled></div></div><div class="row"><button id="saveCampaign" class="btn primary">Save Campaign Mode</button><button id="lockGuildMaster" class="btn">Lock Guild Master</button></div></div>
  <div class="card glass" style="margin-top:14px"><div class="eyebrow">Campaign Editor</div><h2>Trials 01–40</h2><p class="muted">Each reward has two separate identifiers: the physical RC sticker and the authentication code typed into the app. Both can be edited here without changing completed progress.</p><div class="trial-editor">${TRIALS.map(t=>`<details class="editor-trial"><summary><span>Trial ${String(t.id).padStart(2,"0")}</span><b>${escapeHtml(t.reward)}</b><code>${escapeHtml(getRcLabel(t))} · ${escapeHtml(getCode(t))}</code></summary><div class="editor-grid"><div class="field editor-item"><label>Item</label><input data-reward-id="${t.id}" value="${escapeHtml(t.reward)}"></div><div class="field"><label>RC Sticker</label><input data-rc-label-id="${t.id}" value="${escapeHtml(getRcLabel(t))}" placeholder="RC29"></div><div class="field"><label>Authentication Code</label><input data-code-id="${t.id}" value="${escapeHtml(getCode(t))}" placeholder="H020"></div><div class="field"><label>Rarity</label><select data-rarity-id="${t.id}">${["Common","Uncommon","Rare","Legendary","Exotic"].map(r=>`<option value="${r}" ${t.rarity===r?"selected":""}>${r}</option>`).join("")}</select></div><div class="field"><label>Vault Category</label><select data-category-id="${t.id}">${["Credits","Equipment","Provisions","Vouchers","Miscellaneous"].map(c=>`<option value="${c}" ${t.category===c?"selected":""}>${c}</option>`).join("")}</select></div><div class="field"><label>Source</label><select data-source-id="${t.id}">${[["depot","Loot Depot"],["sector","Sector"],["npc","NPC Delivery"],["guild","Guild Master"]].map(([v,l])=>`<option value="${v}" ${t.sourceType===v?"selected":""}>${l}</option>`).join("")}</select></div><div class="field sector-edit ${t.sourceType==="sector"?"":"hidden"}" data-sector-fields="${t.id}"><label>Sector</label><select data-sector-id="${t.id}">${V8_SECTOR_NAMES.map(s=>`<option ${t.sector===s?"selected":""}>${s}</option>`).join("")}</select></div><div class="field sector-edit ${t.sourceType==="sector"?"":"hidden"}" data-sector-fields="${t.id}"><label>Search Directive</label><input data-hide-id="${t.id}" value="${escapeHtml(t.hideSpot||"")}" placeholder="e.g. under coffee table"></div><div class="field"><label>Current Route</label><input value="${escapeHtml(sourceLabel(t))}" disabled></div></div></details>`).join("")}</div><button id="saveTrialEditor" class="btn primary">Save Campaign Editor</button></div>
  <div class="card glass" style="margin-top:14px"><div class="eyebrow">${ICONS.lock} Testing Override</div><h2>Universal Bypass Code</h2><p class="muted">This code works on every recovery-code screen in addition to the real code.</p><div class="code-lock"><input id="masterOverrideCode" value="${escapeHtml(state.masterOverrideCode||"1006")}" maxlength="12"><button id="saveOverrideCode" class="btn primary">Save Override</button></div></div>
  <div class="card glass" style="margin-top:14px"><div class="eyebrow">Testing Controls</div><h2>Campaign Progress</h2><div class="row"><button id="completeNext" class="btn primary">Complete Next</button><button id="complete20" class="btn">Complete First 20</button><button id="jump39" class="btn">Jump to Trial 39</button><button id="replayIntro" class="btn">Replay Intro</button><button id="resetAll" class="btn danger">Reset Everything</button></div></div>`;
  document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{state.campaign.mode=b.dataset.mode;document.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("active",x===b))});
  document.querySelectorAll("[data-source-id]").forEach(sel=>sel.onchange=()=>{document.querySelectorAll(`[data-sector-fields="${sel.dataset.sourceId}"]`).forEach(x=>x.classList.toggle("hidden",sel.value!=="sector"))});
  document.getElementById("saveCampaign").onclick=()=>{state.campaign.startDate=document.getElementById("campaignDate").value||state.campaign.startDate;saveState();toast(`Campaign set to ${state.campaign.mode.toUpperCase()} mode`);renderApp("console")};document.getElementById("lockGuildMaster")?.addEventListener("click",()=>{guildUnlocked=false;toast("Guild Master locked");renderApp("orbit")});
  document.getElementById("saveTrialEditor").onclick=()=>{TRIALS.forEach(t=>{const id=t.id,source=document.querySelector(`[data-source-id="${id}"]`).value,reward=document.querySelector(`[data-reward-id="${id}"]`).value.trim()||t.reward,rarity=document.querySelector(`[data-rarity-id="${id}"]`).value,category=document.querySelector(`[data-category-id="${id}"]`).value,sector=document.querySelector(`[data-sector-id="${id}"]`)?.value||null,hideSpot=document.querySelector(`[data-hide-id="${id}"]`)?.value.trim()||"",rcLabel=document.querySelector(`[data-rc-label-id="${id}"]`).value.trim().toUpperCase(),code=document.querySelector(`[data-code-id="${id}"]`).value.trim().toUpperCase();state.rcLabelOverrides[id]=rcLabel;state.codeOverrides[id]=code;state.trialOverrides[id]={reward,rarity,category,sourceType:source,sector:source==="sector"?sector:null,hideSpot:source==="sector"?hideSpot:""}});applyTrialOverrides();saveState();toast("Campaign editor saved");renderApp("console")};
  document.getElementById("saveOverrideCode").onclick=()=>{state.masterOverrideCode=document.getElementById("masterOverrideCode").value.trim()||"1006";saveState();toast(`Universal override set to ${state.masterOverrideCode}`)};
  document.getElementById("completeNext").onclick=()=>{const t=currentTrial();if(t){const fake=document.createElement("div");fake.remove=()=>{};completeTrial(fake,t)}};document.getElementById("complete20").onclick=()=>awardUntil(20);document.getElementById("jump39").onclick=()=>{state.completed=[];state.xp=0;state.glimmer=0;state.stats=clone(DEFAULT_STATE.stats);saveState();awardUntil(38)};document.getElementById("replayIntro").onclick=titleReveal;document.getElementById("resetAll").onclick=()=>{if(confirm("Reset Guardian, campaign settings, editor changes, codes, and all progress?")){localStorage.removeItem(STORAGE_KEY);state=clone(DEFAULT_STATE);guildUnlocked=false;selectedClass=state.class;selectedRace=state.race;bootSequence()}};
}


const GHOST_LINES={
  mission:[
    "New signal. And before you ask, no, I don't know what's in the box either.",
    "Another trial. The Guild Master has been busy.",
    "Signal acquired. Let's see what we're dealing with."
  ],
  sector:[
    "Signal confirmed. Somewhere in this sector. Try not to dismantle the entire room.",
    "Sector coordinates locked. Eyes up, Guardian.",
    "Recovery signal is close. Probably."
  ],
  correct:[
    "Correct. I knew you had that.",
    "That checks out. Continuing decryption.",
    "Good. One layer down."
  ],
  wrong:[
    "That was... confidently incorrect.",
    "I'm going to pretend I didn't see that.",
    "Nope. Try again, Guardian."
  ],
  language:[
    "Language fragment detected. My translation systems could solve this instantly... but apparently that's cheating.",
    "Another language fragment. You're on your own for this one.",
    "Translation protocol active. The Guild Master insists you earn this."
  ],
  help:[
    "Calling in an external language specialist. Sensible.",
    "Specialist escalation approved."
  ],
  code:[
    "Coordinates decrypted. Find the matching recovery container.",
    "Recovery designation acquired. Now find the cache."
  ],
  badcode:[
    "Nope. Wrong cache.",
    "Authentication rejected. Check the container again."
  ],
  goodcode:[
    "Authentication accepted. Opening relic data...",
    "Code confirmed. Decrypting relic."
  ],
  Common:["Useful. Not everything needs to glow."],
  Uncommon:["Not bad. Definitely keeping that."],
  Rare:["Okay. That's actually pretty good."],
  Legendary:["Now we're talking."],
  Exotic:["Guardian... you might want to look at this.","The Guild Master clearly has favourites."]
};
function ghostSay(type,force=false){
  if(!force && Math.random()>.42)return;
  const lines=GHOST_LINES[type]||GHOST_LINES.mission;
  const line=lines[Math.floor(Math.random()*lines.length)];
  let el=document.getElementById("ghostToast");
  if(!el){
    el=document.createElement("div");
    el.id="ghostToast";
    el.className="ghost-toast";
    document.body.appendChild(el);
  }
  el.innerHTML=`<div class="ghost-mini"><i></i></div><div><b>GHOST</b><p>${line}</p></div>`;
  el.classList.add("show");
  try{uiTone("ghost")}catch(e){}
  clearTimeout(window.__ghostTimer);
  window.__ghostTimer=setTimeout(()=>el.classList.remove("show"),4200);
}


function launchCredits(){
  clearInterval(hudTimer);
  const finalStats=totalStats();
  const rank=Math.floor(state.xp/1000)+1;
  document.body.insertAdjacentHTML("beforeend",`
  <div id="creditsScreen" class="credits-screen">
    <button id="skipCredits" class="credits-skip">Skip Credits</button>
    <div class="credits-stars"></div>
    <div class="credits-intro">
      <div class="ghost-credit-symbol"><i></i></div>
      <div class="eyebrow">GHOST // FINAL TRANSMISSION</div>
      <p>Forty trials. Forty relics recovered.</p>
      <p>Not bad, Guardian.</p>
      <p>There's one final transmission waiting for you.</p>
    </div>
    <div class="credits-roll">
      <div class="credit-title">MISSION COMPLETE</div>
      <div class="credit-main">THE RELIC PROTOCOL</div>
      <div class="credit-sub">THE FORTY TRIALS</div>

      <div class="credit-block"><small>GUARDIAN</small><b>${escapeHtml(state.name)}</b></div>
      <div class="credit-block"><small>CLASS</small><b>${state.class}</b></div>
      <div class="credit-block"><small>ORIGIN</small><b>${state.race}</b></div>
      <div class="credit-block"><small>GUILD MASTER</small><b>Angel</b></div>
      <div class="credit-block"><small>LANGUAGE SPECIALIST</small><b>Mom</b></div>
      <div class="credit-block"><small>NPC SUPPORT</small><b>Classified Personnel</b></div>
      <div class="credit-block"><small>RELICS RECOVERED</small><b>40 / 40</b></div>
      <div class="credit-block"><small>FINAL GUARDIAN RANK</small><b>${rank}</b></div>
      <div class="credit-block"><small>GLIMMER ACQUIRED</small><b>${state.glimmer.toLocaleString()}</b></div>
      <div class="credit-block"><small>CAMPAIGN STATUS</small><b>COMPLETE</b></div>

      <div class="credit-spacer"></div>
      <div class="credit-block"><small>CAMPAIGN DESIGN & QUESTIONABLE DECISIONS</small><b>Angel</b></div>
      <div class="credit-block"><small>RECOVERY OPERATIONS</small><b>${escapeHtml(state.name)}</b></div>
      <div class="credit-block"><small>GHOST</small><b>Himself</b></div>

      <div class="credit-spacer"></div>
      <div class="credit-main final-birthday">HAPPY BIRTHDAY, GUARDIAN</div>
      <div class="credit-italian">Buon compleanno, amore mio.</div>
      <div class="credit-ghost-last"><b>GHOST</b><p>So... same time next year?</p></div>
      <button id="finishCredits" class="btn primary">Return to Orbit</button>
    </div>
  </div>`);
  try{uiTone("success")}catch(e){}
  const finish=()=>{document.getElementById("creditsScreen")?.remove();renderApp("orbit")};
  document.getElementById("skipCredits").onclick=finish;
  document.getElementById("finishCredits").onclick=finish;
}


const _renderOrbitV9=renderOrbit;
renderOrbit=function(screen){
  _renderOrbitV9(screen);
  if(!currentTrial() && state.completed.length>=40){
    const panel=document.createElement("div");
    panel.className="card glass";
    panel.style.marginTop="14px";
    panel.innerHTML=`<div class="eyebrow">Campaign Complete // 40 / 40</div><h2>Final Transmission Archived</h2><p class="muted">The Relic Protocol has been completed.</p><button id="replayEnding" class="btn primary">Replay Ending</button>`;
    screen.appendChild(panel);
    document.getElementById("replayEnding").onclick=launchCredits;
  }
};

// Final initialization: run only after all V8 constants and overrides exist.
starfield();
if(state.phase==="app")renderApp("orbit");
else if(state.phase==="class")classSelection();
else if(state.phase==="race")raceSelection();
else if(state.phase==="sync")syncSequence();
else bootSequence();
