const { parentLoginGet, parentLoginPost, json } = require("../lib/number-ninja-api");
const { requestWithJson, sendNodeResponse } = require("../lib/vercel-response");

module.exports = async function handler(req, res) {
  let response;
  try {
    if (req.method === "GET") response = await parentLoginGet();
    else if (req.method === "POST") response = await parentLoginPost(requestWithJson(req), process.env);
    else response = json({ ok: false, error: "method_not_allowed" }, 405);
  } catch (err) {
    console.error("Parent login API storage failure", err && err.message ? err.message : err);
    response = json({ ok: false, error: "storage_unavailable" }, 503);
  }
  await sendNodeResponse(res, response);
};

module.exports.parentLoginGet = parentLoginGet;
module.exports.parentLoginPost = parentLoginPost;
