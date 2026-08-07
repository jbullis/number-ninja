const { playerGet, playerPost, json } = require("../lib/number-ninja-api");
const { requestWithJson, sendNodeResponse } = require("../lib/vercel-response");

module.exports = async function handler(req, res) {
  let response;
  if (req.method === "GET") response = await playerGet();
  else if (req.method === "POST") response = await playerPost(requestWithJson(req), process.env);
  else response = json({ ok: false, error: "method_not_allowed" }, 405);
  await sendNodeResponse(res, response);
};

module.exports.playerGet = playerGet;
module.exports.playerPost = playerPost;
