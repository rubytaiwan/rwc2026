// worker.js
var LISTMONK_BASE = "https://edm.ruby.tw/api";
var LISTMONK_LIST_ID = 11; // COSCUP2026-Booth (uuid 87b9fdf5-7370-498e-9be1-5792bd7709fc)
var LISTMONK_TX_TEMPLATE_ID = 6; // COSCUP 2026 攤位大地遊戲完成通知
var CORS = {
  "Access-Control-Allow-Origin": "https://coscup2026.ruby.tw",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};
var worker_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    const a = body.attribs || {};
    const auth = `Basic ${btoa(`coscup2026-booth:${env.LISTMONK_API_TOKEN}`)}`;
    const headers = { "Content-Type": "application/json", "Authorization": auth };
    const createResp = await fetch(`${LISTMONK_BASE}/subscribers`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: body.email,
        name: body.name,
        status: "enabled",
        attribs: {
          phone: a.phone || "",
          school: a.school || "",
          ruby_course_interest: a.ruby_course_interest ?? false,
          message: a.message || "",
          score: a.score ?? 0,
          total: a.total ?? 10
        },
        preconfirm_subscriptions: true
      })
    });
    const createData = await createResp.json();
    let subscriberId = createData.data?.id;
    if (!subscriberId) {
      // 建立失敗（多半是 409 email 已存在）→ 查回既有 subscriber，讓重複填表也能寄信
      const email = String(body.email || "").toLowerCase().replace(/'/g, "''");
      const query = encodeURIComponent(`subscribers.email='${email}'`);
      const lookupResp = await fetch(`${LISTMONK_BASE}/subscribers?query=${query}`, { headers });
      const lookupData = await lookupResp.json();
      subscriberId = lookupData.data?.results?.[0]?.id;
      if (!subscriberId) {
        return new Response(JSON.stringify(createData), {
          status: createResp.status,
          headers: { ...CORS, "Content-Type": "application/json" }
        });
      }
    }
    // 這兩步以前是 fire-and-forget，寄信失敗時完全無跡可尋（worker 照樣回 200）。
    // 現在把 status/body 帶回去，前端 console 就看得到。
    const step = async (label, url, init) => {
      const resp = await fetch(url, { headers, ...init });
      const text = await resp.text();
      return { label, ok: resp.ok, status: resp.status, body: text.slice(0, 300) };
    };
    const listResult = await step("subscribers/lists", `${LISTMONK_BASE}/subscribers/lists`, {
      method: "PUT",
      body: JSON.stringify({
        ids: [subscriberId],
        action: "add",
        target_list_ids: [LISTMONK_LIST_ID],
        status: "confirmed"
      })
    });
    const txResult = await step("tx", `${LISTMONK_BASE}/tx`, {
      method: "POST",
      body: JSON.stringify({
        subscriber_email: body.email,
        template_id: LISTMONK_TX_TEMPLATE_ID
      })
    });
    return new Response(JSON.stringify({
      subscriber_id: subscriberId,
      created: !!createData.data?.id,
      mailed: txResult.ok,
      steps: [listResult, txResult]
    }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
};
export {
  worker_default as default
};
