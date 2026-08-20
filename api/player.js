const { playerGet, playerPost, json } = require("../lib/number-ninja-api");
const { requestWithJson, sendNodeResponse } = require("../lib/vercel-response");

module.exports = async function handler(req, res) {
  let response;
  try {
    if (req.method === "GET") response = await playerGet();
    else if (req.method === "POST") response = await playerPost(requestWithJson(req), process.env);
    else response = json({ ok: false, error: "method_not_allowed" }, 405);
  } catch (err) {
    console.error("Player API storage failure", err && err.message ? err.message : err);
    response = json({ ok: false, error: "storage_unavailable" }, 503);
  }
  await sendNodeResponse(res, response);
};

module.exports.playerGet = playerGet;
module.exports.playerPost = playerPost;
