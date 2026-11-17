// worker.js
var LISTMONK_BASE = "https://edm.ruby.tw/api";
var LISTMONK_LIST_ID = 13; // RWC2026-Booth（uuid 見 _config.yml）
// 完成通知信 tx template（模板原稿見 templates/）。zh-TW 沿用 en
var LISTMONK_TX_TEMPLATE_IDS = { ja: 7, en: 8 };
var CORS = {
  "Access-Control-Allow-Origin": "https://rwc2026.ruby.tw",
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
    const auth = `Basic ${btoa(`rwc2026-booth-api-user:${env.LISTMONK_API_TOKEN}`)}`;
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
        lists: [LISTMONK_LIST_ID],
        preconfirm_subscriptions: true
      })
    });
    const createData = await createResp.json();
    let subscriberId = createData.data?.id;
    let lookup = null;
    if (!subscriberId) {
      // 建立失敗（多半是 409 email 已存在）→ 查回既有 subscriber，讓重複填表也能寄信
      const email = String(body.email || "").toLowerCase().replace(/'/g, "''");
      const query = encodeURIComponent(`subscribers.email='${email}'`);
      const lookupResp = await fetch(`${LISTMONK_BASE}/subscribers?query=${query}`, { headers });
      const text = await lookupResp.text();
      lookup = { status: lookupResp.status, body: text.slice(0, 400) };
      try {
        subscriberId = JSON.parse(text).data?.results?.[0]?.id;
      } catch { /* 非 JSON，交給 lookup.body 回報 */ }
    }
    // 這兩步以前是 fire-and-forget，寄信失敗時完全無跡可尋（worker 照樣回 200）。
    // 現在把 status/body 帶回去，前端 console 就看得到。
    const step = async (label, url, init) => {
      const resp = await fetch(url, { headers, ...init });
      const text = await resp.text();
      return { label, ok: resp.ok, status: resp.status, body: text.slice(0, 300) };
    };
    // 沒有 id 就跳過（API user 若少了 subscribers:sql_query，email 已存在時查不回 id）。
    // create 已經帶 lists，所以新 subscriber 不靠這一步也會進名單。
    const listResult = subscriberId
      ? await step("subscribers/lists", `${LISTMONK_BASE}/subscribers/lists`, {
        method: "PUT",
        body: JSON.stringify({
          ids: [subscriberId],
          action: "add",
          target_list_ids: [LISTMONK_LIST_ID],
          status: "confirmed"
        })
      })
      : { label: "subscribers/lists", ok: true, status: 0, body: "skipped: no subscriber id" };
    // tx 只吃 email，不需要 id —— 所以上面查不到 id 也照樣寄得出去
    const txResult = await step("tx", `${LISTMONK_BASE}/tx`, {
      method: "POST",
      body: JSON.stringify({
        subscriber_email: body.email,
        template_id: LISTMONK_TX_TEMPLATE_IDS[body.ui_lang] ?? LISTMONK_TX_TEMPLATE_IDS.en
      })
    });
    return new Response(JSON.stringify({
      subscriber_id: subscriberId,
      created: !!createData.data?.id,
      mailed: txResult.ok,
      lookup,
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
