#!/usr/bin/env node
/**
 * patch.js
 * 執行方式：node patch.js
 * 在 volvo-upload-test 根目錄執行，自動修改 performance.html
 */
const fs = require('fs');
const path = require('path');

const PERF_PATH = path.join(__dirname, 'public', 'performance.html');

let html = fs.readFileSync(PERF_PATH, 'utf8');

// ─── Patch 1：filter-bar 加入「業績預估」按鈕 ───
html = html.replace(
  `      <button class="btn btn-primary" onclick="doLoad()">查詢</button>
      <span id="lastUpdate" style="margin-left:auto;font-size:11px;color:#64748b;white-space:nowrap"></span>`,
  `      <button class="btn btn-primary" onclick="doLoad()">查詢</button>
      <button class="btn btn-secondary" onclick="openEstimateModal()" style="font-size:12px;padding:7px 14px;white-space:nowrap">✏️ 業績預估</button>
      <span id="lastUpdate" style="margin-left:auto;font-size:11px;color:#64748b;white-space:nowrap"></span>`
);

// ─── Patch 2：tab-bar 移除 estimate tab 按鈕 ───
html = html.replace(
  `    <div class="tab-bar-wrap">
      <button id="tab-btn-progress" class="tab-btn active" onclick="switchPerfTab('progress')">📊 業績進度</button>
      <button id="tab-btn-estimate" class="tab-btn" onclick="switchPerfTab('estimate')">✏️ 業績預估</button>
    </div>`,
  `    <div class="tab-bar-wrap">
      <button id="tab-btn-progress" class="tab-btn active" onclick="switchPerfTab('progress')">📊 業績進度</button>
    </div>`
);

// ─── Patch 3：移除 tab-estimate div 整個區塊 ───
const estDivStart = `\n  <div id="tab-estimate" style="display:none">`;
const estDivEnd   = `  </div>\n\n</div>\n\n<script>`;  // 後面緊接 </div> 是 .container，然後是 <script>
// 更穩定的做法：找到唯一的 estSaveMsg 作為錨點
const startMarker = '\n  <div id="tab-estimate" style="display:none">';
const endMarker   = '<div id="estSaveMsg"';
const closingSeq  = '</div>\n    </div>\n  </div>\n\n</div>';

// 找到 tab-estimate 的起始和結束
const tabEstStart = html.indexOf(startMarker);
if (tabEstStart !== -1) {
  // 找到 </div> 結尾（整個 tab-estimate div）
  // 從起始往後找三個嵌套 </div> 的閉合
  let depth = 0;
  let i = tabEstStart;
  let found = false;
  while (i < html.length - 5) {
    if (html.substring(i, i+5) === '<div ') depth++;
    else if (html.substring(i, i+4) === '<div') depth++;
    else if (html.substring(i, i+6) === '</div>') {
      if (depth <= 0) { i += 6; found = true; break; }
      depth--;
    }
    i++;
  }
  // 用更直接的字串比對
}

// 直接用字串替換（用唯一的 id 定位）
const TAB_EST_PATTERN = /\n  <div id="tab-estimate" style="display:none">[\s\S]*?<div id="estSaveMsg"[^>]*><\/div>\n    <\/div>\n  <\/div>/;
html = html.replace(TAB_EST_PATTERN, '');

// ─── Patch 4：更新 switchPerfTab ───
html = html.replace(
`function switchPerfTab(tab){
  ['progress','estimate'].forEach(t=>{
    document.getElementById(\`tab-\${t}\`).style.display=t===tab?'':'none';
    document.getElementById(\`tab-btn-\${t}\`).classList.toggle('active',t===tab);
  });
  if(tab==='estimate')renderEstTable();
}`,
`function switchPerfTab(tab){
  // 僅剩進度頁，預估已改為 Modal
  document.getElementById('tab-progress').style.display='';
  document.getElementById('tab-btn-progress').classList.add('active');
}`
);

// ─── Patch 5：移除 renderEstTable 和 saveAllEstimates ───
const RENDER_EST_START = '\nasync function renderEstTable() {';
const SAVE_ALL_END     = `  finally{if(btn){btn.disabled=false;btn.textContent='💾 儲存預估';}}\n}`;
const iRenderStart = html.indexOf(RENDER_EST_START);
const iSaveEnd     = html.indexOf(SAVE_ALL_END);
if (iRenderStart !== -1 && iSaveEnd !== -1) {
  html = html.slice(0, iRenderStart) + html.slice(iSaveEnd + SAVE_ALL_END.length);
}

// ─── Patch 6：在 </script></body></html> 之前插入 Modal JS ───
const MODAL_JS = `
// ════════════════════════════════════════════════════════════
// 業績預估 Modal — 週次鎖定機制
// ════════════════════════════════════════════════════════════
let _estModalData = {};

function openEstimateModal() {
  const period = getPeriod();
  if (!period) { alert('請先選擇期間'); return; }
  document.getElementById('estimateModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  document.getElementById('estModalPeriod').textContent =
    period.slice(0,4)+'年'+parseInt(period.slice(4))+'月';
  switchEstTab('input');
  loadEstimateModalData(period);
}

function closeEstimateModal() {
  document.getElementById('estimateModal').style.display = 'none';
  document.body.style.overflow = '';
}

function switchEstTab(tab) {
  ['input','history'].forEach(function(t) {
    var content = document.getElementById('estTabContent-'+t);
    var btn     = document.getElementById('estTab-'+t);
    if (content) content.style.display = t === tab ? '' : 'none';
    if (btn) {
      btn.style.background        = t === tab ? '#3b82f6' : 'transparent';
      btn.style.color             = t === tab ? '#fff'    : '#64748b';
      btn.style.borderBottomColor = t === tab ? '#3b82f6' : 'transparent';
      btn.style.fontWeight        = t === tab ? '700'     : '600';
    }
  });
  var footer = document.getElementById('estModalFooter');
  if (footer) footer.style.display = tab === 'input' ? 'flex' : 'none';
}

async function loadEstimateModalData(period) {
  document.getElementById('estTabContent-input').innerHTML =
    '<div style="padding:32px;text-align:center;color:#64748b"><span class="spinner"></span>載入中</div>';
  document.getElementById('estTabContent-history').innerHTML =
    '<div style="padding:32px;text-align:center;color:#64748b"><span class="spinner"></span>載入中</div>';
  try {
    const [weekStatus, history] = await Promise.all([
      fetch('/api/revenue-estimates/week-status?period='+period).then(r=>r.json()),
      fetch('/api/revenue-estimates/history?period='+period).then(r=>r.json()),
    ]);
    _estModalData = { period, weekStatus, history };
    renderEstInputTab(weekStatus);
    renderEstHistoryTab(history);
  } catch(e) {
    document.getElementById('estTabContent-input').innerHTML =
      '<div style="color:#ef4444;padding:16px">❌ '+e.message+'</div>';
  }
}

function renderEstInputTab(ws) {
  const BRANCHES = ['AMA','AMC','AMD'];
  const brColors = {AMA:'#3b82f6',AMC:'#10b981',AMD:'#f59e0b'};
  const KEYS = [
    {key:'paid',     label:'🔶 有費',col:'#f97316'},
    {key:'general',  label:'💙 一般',col:'#3b82f6'},
    {key:'bodywork', label:'🔨 鈑烤',col:'#8b5cf6'},
    {key:'extended', label:'🛡️ 延保',col:'#10b981'},
  ];
  const allLocked = BRANCHES.every(function(br){return ws.submissions[br];});
  let html = '<div style="background:rgba(59,130,246,.07);border:1px solid rgba(59,130,246,.2);border-radius:8px;padding:10px 14px;font-size:12px;color:#94a3b8;margin-bottom:16px;line-height:1.9">'
    +'📅 本週：<strong style="color:#e2e8f0">'+ws.week_label+'</strong>（週一 '+ws.week_key+'）<br>'
    +'💡 每自然週（週一～週日）可提交一次預估，提交後本週鎖定，下週可提交新版本。'
    +'</div>'
    +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:560px">'
    +'<thead><tr>'
    +'<th style="padding:9px 12px;background:#0f172a;color:#64748b;font-size:11px;border-bottom:1px solid #2d3f56;text-align:left">據點</th>'
    +KEYS.map(function(k){return '<th style="padding:9px 12px;background:#0f172a;color:'+k.col+';font-size:11px;font-weight:800;border-bottom:1px solid #2d3f56;text-align:right">'+k.label+' (K)</th>';}).join('')
    +'<th style="padding:9px 12px;background:#0f172a;color:#64748b;font-size:11px;border-bottom:1px solid #2d3f56;text-align:center;min-width:90px">狀態</th>'
    +'</tr></thead><tbody>';
  BRANCHES.forEach(function(br) {
    const sub    = ws.submissions[br];
    const locked = !!sub;
    const col    = brColors[br];
    html += '<tr style="background:'+(locked?'rgba(16,185,129,.03)':'transparent')+'">'
      +'<td style="padding:12px;border-bottom:1px solid rgba(45,63,86,.3)">'
      +'<span style="background:'+col+'22;color:'+col+';padding:4px 12px;border-radius:6px;font-size:12px;font-weight:800">'+br+'</span></td>';
    KEYS.forEach(function(k) {
      const raw = sub ? Math.round((sub[k.key+'_estimate']||0)/1000) : '';
      if (locked) {
        html += '<td style="padding:10px 12px;border-bottom:1px solid rgba(45,63,86,.3);text-align:right">'
          +'<span style="color:'+k.col+';font-weight:700;font-size:14px">'+(raw||'—')+'</span></td>';
      } else {
        html += '<td style="padding:7px 8px;border-bottom:1px solid rgba(45,63,86,.3)">'
          +'<div style="display:flex;align-items:center;gap:4px;justify-content:flex-end">'
          +'<input type="number" id="weekEst-'+k.key+'-'+br+'" value="'+(raw||'')+'" placeholder="—" min="0" step="1" '
          +'style="background:#0f172a;border:1px solid #2d3f56;color:'+k.col+';padding:7px 8px;border-radius:5px;font-size:13px;font-weight:700;width:96px;text-align:right;outline:none" '
          +'onfocus="this.style.borderColor=\''+k.col+'\'" onblur="this.style.borderColor=\'#2d3f56\'">'
          +'<span style="font-size:10px;color:#475569">K</span></div></td>';
      }
    });
    if (locked) {
      const ts = new Date(sub.submitted_at).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
      html += '<td style="padding:10px 12px;border-bottom:1px solid rgba(45,63,86,.3);text-align:center">'
        +'<div style="display:inline-flex;flex-direction:column;align-items:center;gap:3px">'
        +'<span style="background:rgba(16,185,129,.15);color:#10b981;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700">✅ 已提交</span>'
        +'<span style="font-size:10px;color:#475569">'+ts+'</span></div></td>';
    } else {
      html += '<td style="padding:10px 12px;border-bottom:1px solid rgba(45,63,86,.3);text-align:center">'
        +'<span style="background:rgba(245,158,11,.1);color:#f59e0b;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700">⏳ 待提交</span></td>';
    }
    html += '</tr>';
  });
  html += '</tbody></table></div>';
  if (allLocked) {
    html += '<div style="margin-top:14px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:8px;padding:10px 14px;font-size:12px;color:#10b981;text-align:center">'
      +'✅ 本週三個據點均已提交完畢，下週可再次提交更新版預估。</div>';
  }
  document.getElementById('estTabContent-input').innerHTML = html;
  const btn = document.getElementById('btnSubmitEst');
  if (btn) btn.style.display = allLocked ? 'none' : '';
}

function renderEstHistoryTab(history) {
  const el = document.getElementById('estTabContent-history');
  if (!history||!history.length) {
    el.innerHTML='<div style="padding:40px;text-align:center;color:#64748b">📭 此期間尚無歷史預估紀錄</div>';
    return;
  }
  const weeks={};
  history.forEach(function(h){
    if(!weeks[h.week_key]) weeks[h.week_key]={week_key:h.week_key,week_label:h.week_label,branches:{}};
    weeks[h.week_key].branches[h.branch]=h;
  });
  const BRANCHES=['AMA','AMC','AMD'];
  const brColors={AMA:'#3b82f6',AMC:'#10b981',AMD:'#f59e0b'};
  const fmtK=function(v){return v?Math.round(parseFloat(v)/1000).toLocaleString():'—';};
  const fmtTs=function(v){return new Date(v).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});};
  const sorted=Object.values(weeks).sort(function(a,b){return b.week_key.localeCompare(a.week_key);});
  let html='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px">'
    +'<thead><tr>'
    +'<th rowspan="2" style="padding:9px 12px;background:#0f172a;color:#64748b;font-size:11px;border-bottom:1px solid #2d3f56;text-align:left;min-width:110px">週次</th>'
    +BRANCHES.map(function(br){return '<th colspan="5" style="padding:8px;background:#0f172a;color:'+brColors[br]+';font-size:11px;font-weight:800;border-bottom:1px solid #1e3050;text-align:center">'+br+'</th>';}).join('')
    +'</tr><tr>'
    +BRANCHES.map(function(){return '<th style="padding:6px 7px;background:#0c1524;color:#475569;font-size:10px;border-bottom:1px solid #2d3f56;text-align:right">有費K</th>'
      +'<th style="padding:6px 7px;background:#0c1524;color:#475569;font-size:10px;border-bottom:1px solid #2d3f56;text-align:right">一般K</th>'
      +'<th style="padding:6px 7px;background:#0c1524;color:#475569;font-size:10px;border-bottom:1px solid #2d3f56;text-align:right">鈑烤K</th>'
      +'<th style="padding:6px 7px;background:#0c1524;color:#475569;font-size:10px;border-bottom:1px solid #2d3f56;text-align:right">延保K</th>'
      +'<th style="padding:6px 7px;background:#0c1524;color:#475569;font-size:10px;border-bottom:1px solid #2d3f56;white-space:nowrap">提交時間</th>';}).join('')
    +'</tr></thead><tbody>';
  sorted.forEach(function(week,wi){
    const bg=wi%2===0?'transparent':'rgba(255,255,255,.02)';
    html+='<tr style="background:'+bg+'">'
      +'<td style="padding:10px 12px;border-bottom:1px solid rgba(45,63,86,.2)">'
      +'<div style="font-weight:700;color:#e2e8f0">'+week.week_label+'</div>'
      +'<div style="font-size:10px;color:#475569;margin-top:2px">'+week.week_key+'</div></td>';
    BRANCHES.forEach(function(br){
      const sub=week.branches[br];
      if(sub){
        const c=brColors[br];
        html+='<td style="padding:10px 7px;border-bottom:1px solid rgba(45,63,86,.2);text-align:right;color:'+c+';font-weight:700">'+fmtK(sub.paid_estimate)+'</td>'
          +'<td style="padding:10px 7px;border-bottom:1px solid rgba(45,63,86,.2);text-align:right;color:#3b82f6">'+fmtK(sub.general_estimate)+'</td>'
          +'<td style="padding:10px 7px;border-bottom:1px solid rgba(45,63,86,.2);text-align:right;color:#8b5cf6">'+fmtK(sub.bodywork_estimate)+'</td>'
          +'<td style="padding:10px 7px;border-bottom:1px solid rgba(45,63,86,.2);text-align:right;color:#10b981">'+fmtK(sub.extended_estimate)+'</td>'
          +'<td style="padding:10px 7px;border-bottom:1px solid rgba(45,63,86,.2);color:#475569;font-size:10px;white-space:nowrap">'+fmtTs(sub.submitted_at)+'</td>';
      } else {
        html+='<td colspan="5" style="padding:10px 7px;border-bottom:1px solid rgba(45,63,86,.2);text-align:center;color:#2d4060">—</td>';
      }
    });
    html+='</tr>';
  });
  html+='</tbody></table></div>';
  el.innerHTML=html;
}

async function submitWeeklyEstimate() {
  const period = getPeriod();
  if (!period) return;
  const ws = _estModalData.weekStatus;
  if (!ws) return;
  const BRANCHES = ['AMA','AMC','AMD'];
  const entries = [];
  let hasAny = false;
  BRANCHES.forEach(function(br) {
    if (ws.submissions[br]) return;
    const get = function(k) {
      const v = parseFloat((document.getElementById('weekEst-'+k+'-'+br)||{}).value);
      return (!isNaN(v) && v >= 0) ? Math.round(v*1000) : null;
    };
    const e = {branch:br, paid:get('paid'), general:get('general'), bodywork:get('bodywork'), extended:get('extended')};
    if ([e.paid,e.general,e.bodywork,e.extended].some(function(v){return v!==null;})) hasAny=true;
    entries.push(e);
  });
  if (!entries.length) { alert('所有據點本週均已提交'); return; }
  if (!hasAny) { alert('請至少填入一個預估值（0 以上）'); return; }
  const btn = document.getElementById('btnSubmitEst');
  if (btn) { btn.disabled=true; btn.textContent='提交中...'; }
  try {
    const res = await fetch('/api/revenue-estimates/weekly-submit', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({period,entries}),
    }).then(function(r){return r.json();});
    if (res.error) throw new Error(res.error);
    await loadEstimateModalData(period);
    await loadRevenueKPI(period, document.getElementById('selBranch').value);
  } catch(e) {
    alert('提交失敗：'+e.message);
  } finally {
    if (btn) { btn.disabled=false; btn.textContent='🚀 提交本週預估'; }
  }
}
document.addEventListener('keydown', function(e) {
  if (e.key==='Escape' && document.getElementById('estimateModal')&&document.getElementById('estimateModal').style.display!=='none')
    closeEstimateModal();
});
`;

// ─── Patch 6：在 </script> 前插入 Modal JS ───
html = html.replace(
  ` function initTheme(){const s=localStorage.getItem('volvo_theme')||'dark';applyTheme(s,false);}`,
  MODAL_JS + ` function initTheme(){const s=localStorage.getItem('volvo_theme')||'dark';applyTheme(s,false);}`
);

// ─── Patch 7：在 </body> 前插入 Modal HTML ───
const MODAL_HTML = `
<!-- ════ 業績預估 Modal ════ -->
<div id="estimateModal"
  style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:800;
         align-items:center;justify-content:center;padding:16px;overflow-y:auto"
  onclick="if(event.target===this)closeEstimateModal()">
  <div style="background:#1a2740;border:1px solid #2d4060;border-radius:14px;
              width:100%;max-width:860px;display:flex;flex-direction:column;
              box-shadow:0 24px 64px rgba(0,0,0,.88);margin:auto;max-height:90vh">
    <div style="display:flex;align-items:flex-start;gap:12px;padding:16px 20px 0;flex-shrink:0">
      <div style="flex:1">
        <div style="font-size:15px;font-weight:800;color:#fff">✏️ 業績預估設定</div>
        <div style="font-size:12px;color:#64748b;margin-top:3px" id="estModalPeriod"></div>
      </div>
      <button onclick="closeEstimateModal()"
        style="width:30px;height:30px;border-radius:7px;border:1px solid #2d3f56;
               background:#0f172a;color:#64748b;font-size:18px;line-height:1;cursor:pointer;
               display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">×</button>
    </div>
    <div style="display:flex;padding:12px 20px 0;flex-shrink:0">
      <button id="estTab-input" onclick="switchEstTab('input')"
        style="padding:8px 22px;border:none;border-radius:7px 7px 0 0;font-size:13px;font-weight:700;
               cursor:pointer;background:#3b82f6;color:#fff;border-bottom:2px solid #3b82f6">本週預估</button>
      <button id="estTab-history" onclick="switchEstTab('history')"
        style="padding:8px 22px;border:none;border-radius:7px 7px 0 0;font-size:13px;font-weight:600;
               cursor:pointer;background:transparent;color:#64748b;border-bottom:2px solid transparent">歷史紀錄</button>
    </div>
    <div style="height:2px;background:#2d3f56;flex-shrink:0"></div>
    <div id="estTabContent-input" style="padding:18px 20px;overflow-y:auto;flex:1;max-height:65vh">
      <div style="padding:32px;text-align:center;color:#64748b"><span class="spinner"></span>載入中</div>
    </div>
    <div id="estTabContent-history" style="display:none;padding:18px 20px;overflow-y:auto;flex:1;max-height:65vh">
      <div style="padding:32px;text-align:center;color:#64748b"><span class="spinner"></span>載入中</div>
    </div>
    <div id="estModalFooter"
      style="padding:12px 20px 16px;border-top:1px solid #2d3f56;display:flex;gap:8px;
             justify-content:flex-end;flex-shrink:0">
      <button onclick="closeEstimateModal()"
        style="padding:7px 16px;background:#253347;color:#cbd5e1;border:1px solid #2d3f56;
               border-radius:6px;font-size:13px;font-weight:600;cursor:pointer">關閉</button>
      <button id="btnSubmitEst" onclick="submitWeeklyEstimate()"
        style="padding:7px 18px;background:#3b82f6;color:#fff;border:none;
               border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">
        🚀 提交本週預估
      </button>
    </div>
  </div>
</div>
`;

html = html.replace('</body>', MODAL_HTML + '</body>');

fs.writeFileSync(PERF_PATH, html, 'utf8');
console.log('✅ performance.html 已成功更新！');
console.log('');
console.log('接下來請：');
console.log('1. 確認 routes/revenue.js 已替換為新版（包含週次 API）');
console.log('2. 在 db/init.js 的 revenue_estimates 之後加入 revenue_estimate_history 表格建立語句');
console.log('3. 部署後 DB 會自動建立新表格');
