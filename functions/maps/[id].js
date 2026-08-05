// GET /maps/<id> —— 单个项目的地图页
// 内容由 Mac mini 渲染后推 KV（/api/maps-push），这里现取现服务。
// 鉴权：middleware 已对本路径强制 cookie 密码门。
const ID_RE = /^[a-z0-9-]+$/;

export async function onRequestGet(context) {
  const id = context.params.id;
  if (typeof id !== "string" || !ID_RE.test(id)) {
    return new Response("bad id", { status: 400 });
  }
  const html = await context.env.DASHBOARD.get(`map_html_${id}`);
  if (!html) {
    return new Response("<h1>404</h1><p>没有这个项目的地图。</p>", {
      status: 404,
      headers: htmlHeaders(),
    });
  }
  return new Response(injectUpdateButton(html, id), { status: 200, headers: htmlHeaders() });
}

// 右下角悬浮入口（注入发生在服务层，渲染器保持纯净）：
// 「给这个项目派活」→ 输入需求 → 写 KV → Mac mini poller 在项目目录开 Claude 会话直接开工（地图=项目入口）
// 「让 Agent 更新地图」→ 开会话核对并更新这张地图
function injectUpdateButton(html, id) {
  const FONT = "ui-sans-serif,system-ui,-apple-system,'PingFang SC',sans-serif";
  const snippet = `
<div id="pm-sync" style="position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:99;display:flex;flex-direction:column;align-items:flex-end;gap:8px">
  <div id="pm-task-panel" style="display:none;width:min(78vw,300px);padding:10px;border-radius:14px;background:rgba(24,24,27,.95);box-shadow:0 2px 14px rgba(0,0,0,.3)">
    <textarea id="pm-task-text" rows="3" placeholder="想做什么优化 / 加什么功能，用人话写一句" style="width:100%;box-sizing:border-box;font:14px/1.5 ${FONT};padding:8px;border:none;border-radius:8px;resize:vertical;background:#fff;color:#18181b"></textarea>
    <button onclick="pmTask()" style="margin-top:8px;width:100%;font:500 14px/1 ${FONT};padding:11px 0;border:none;border-radius:999px;cursor:pointer;color:#fff;background:#4f5fd6">开工：开新 Claude 会话</button>
  </div>
  <button onclick="pmTogglePanel()" style="font:500 14px/1 ${FONT};padding:11px 16px;border:none;border-radius:999px;cursor:pointer;color:#fff;background:#4f5fd6;box-shadow:0 2px 10px rgba(0,0,0,.25)">给这个项目派活</button>
  <button onclick="pmSync()" style="font:500 13px/1 ${FONT};padding:10px 14px;border:none;border-radius:999px;cursor:pointer;color:#fff;background:rgba(24,24,27,.92);box-shadow:0 2px 10px rgba(0,0,0,.25)">让 Agent 更新地图</button>
  <div id="pm-toast" style="display:none;max-width:260px;font:13px/1.5 ${FONT};padding:10px 12px;border-radius:10px;color:#fff;background:rgba(24,24,27,.92)"></div>
</div>
<script>
var PM_ID=${JSON.stringify(id)};
function pmTogglePanel(){
  var p=document.getElementById('pm-task-panel');
  var show=p.style.display==='none';
  p.style.display=show?'block':'none';
  if(show)document.getElementById('pm-task-text').focus();
}
async function pmPost(body,okMsg){
  var t=document.getElementById('pm-toast');t.style.display='block';t.textContent='派单中…';
  try{
    var r=await fetch('/api/claude-launch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok)throw new Error(r.status);
    t.textContent=okMsg;
    setTimeout(function(){t.style.display='none'},12000);
    return true;
  }catch(e){t.textContent='派单失败：'+e.message+'（Mac mini 在线吗？）';return false;}
}
async function pmTask(){
  var el=document.getElementById('pm-task-text');
  var v=(el.value||'').trim();
  if(!v){var t=document.getElementById('pm-toast');t.style.display='block';t.textContent='先写一句需求再开工';return;}
  if(await pmPost({mode:'task',project:PM_ID,prompt:v},'已派单：Mac mini 正在项目目录开 Claude 会话干这个活，半分钟后 claude.ai 会话列表可接续对话。')){
    el.value='';document.getElementById('pm-task-panel').style.display='none';
  }
}
function pmSync(){pmPost({mode:'map-update',project:PM_ID},'已派单：Mac mini 正在开 Claude 会话核对这张地图，更完自动推送到这里（也会出现在 claude.ai 会话列表）。');}
</script>`;
  return html.includes("</body>") ? html.replace("</body>", snippet + "</body>") : html + snippet;
}

function htmlHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };
}
