async function readBody(req) {
  if (req.body !== undefined) {
    return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function sendNodeResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(await response.text());
}

function requestWithJson(req) {
  return {
    url: req.url || "",
    headers: {
      get(name) {
        const value = req.headers && req.headers[String(name).toLowerCase()];
        return Array.isArray(value) ? value[0] : value || null;
      },
    },
    json() {
      return readBody(req);
    },
  };
}

module.exports = {
  requestWithJson,
  sendNodeResponse,
};
