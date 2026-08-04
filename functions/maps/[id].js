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

// 右下角悬浮按钮：手机上一按 → 写 KV → Mac mini poller 开 Claude 会话核对并更新这张地图。
// 注入发生在服务层，渲染器保持纯净（地图内容与部署能力解耦）。
function injectUpdateButton(html, id) {
  const snippet = `
<div id="pm-sync" style="position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:99">
  <button onclick="pmSync()" style="font:500 14px/1 ui-sans-serif,system-ui,-apple-system,'PingFang SC',sans-serif;
    padding:11px 16px;border:none;border-radius:999px;cursor:pointer;color:#fff;
    background:#4f5fd6;box-shadow:0 2px 10px rgba(0,0,0,.25)">让 Agent 更新地图</button>
  <div id="pm-toast" style="display:none;margin-top:8px;max-width:240px;font:13px/1.5 ui-sans-serif,system-ui,'PingFang SC',sans-serif;
    padding:10px 12px;border-radius:10px;color:#fff;background:rgba(24,24,27,.92)"></div>
</div>
<script>
async function pmSync(){
  var t=document.getElementById('pm-toast');t.style.display='block';t.textContent='派单中…';
  try{
    var r=await fetch('/api/claude-launch',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({mode:'map-update',project:${JSON.stringify(id)}})});
    if(!r.ok)throw new Error(r.status);
    t.textContent='已派单：Mac mini 正在开 Claude 会话核对这张地图，更完自动推送到这里（也会出现在 claude.ai 会话列表）。';
    setTimeout(function(){t.style.display='none'},12000);
  }catch(e){t.textContent='派单失败：'+e.message+'（Mac mini 在线吗？）';}
}
</script>`;
  return html.includes("</body>") ? html.replace("</body>", snippet + "</body>") : html + snippet;
}

function htmlHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };
}
