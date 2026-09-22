// 历史远程启动入口已退役；保留旧 URL，避免旧页面或客户端继续派发请求。
// 不读取请求体、待执行命令或 KV，也不写入任何启动请求。
export function onRequest() {
  return new Response(JSON.stringify({
    error: "remote_launch_retired",
    message: "请在App中创建任务",
  }), {
    status: 410,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
