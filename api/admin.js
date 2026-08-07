const { adminGet } = require("../lib/admin-api");
const { json } = require("../lib/number-ninja-api");
const { sendNodeResponse } = require("../lib/vercel-response");

module.exports = async function handler(req, res) {
  let response;
  if (req.method === "GET") {
    const request = {
      url: req.url || "https://number-ninja.local/api/admin",
      headers: {
        get(name) {
          const value = req.headers && req.headers[String(name).toLowerCase()];
          return Array.isArray(value) ? value[0] : value || null;
        },
      },
    };
    response = await adminGet(request, process.env);
  } else {
    response = json({ ok: false, error: "method_not_allowed" }, 405);
  }
  await sendNodeResponse(res, response);
};

module.exports.adminGet = adminGet;
