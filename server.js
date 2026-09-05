import http from "node:http";

const PORT = process.env.PORT || 10000;

const PUBLIC_URL =
  "https://www.binance.com/bapi/c2c/v1/public/c2c/agent/ad-list";

const WEB_URL =
  "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
const QUOTE_URL =
  "https://www.binance.com/bapi/c2c/v1/public/c2c/agent/quote-price";

const TRADE_METHODS_URL =
  "https://www.binance.com/bapi/c2c/v1/public/c2c/agent/trade-methods";

const browserHeaders = {
"content-type": "application/json",
"bnc-location": "BR",
};

function countItems(data) {
  if (Array.isArray(data?.data)) return data.data.length;
  if (Array.isArray(data?.data?.items)) return data.data.items.length;
  if (Array.isArray(data?.items)) return data.items.length;
  return 0;
}

function firstItem(data) {
  if (Array.isArray(data?.data)) return data.data[0];
  if (Array.isArray(data?.data?.items)) return data.data.items[0];
  if (Array.isArray(data?.items)) return data.items[0];
  return null;
}
function adIds(data) {
  const items = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.data?.items)
      ? data.data.items
      : Array.isArray(data?.items)
        ? data.items
        : [];

  return items
    .map((item) => item?.adv?.advNo || item?.advNo || null)
    .filter(Boolean);
}
function structuralSummary(item) {
  if (!item || typeof item !== "object") return null;

  const adv = item.adv || item;
  const advertiser = item.advertiser || {};

  return {
    firstItemKeys: Object.keys(item),
    advKeys:
      adv && typeof adv === "object" ? Object.keys(adv) : [],
    advertiserKeys:
      advertiser && typeof advertiser === "object"
        ? Object.keys(advertiser)
        : [],
    hasAdvId: Boolean(adv?.advNo || adv?.advId || adv?.id),
    hasPrice: adv?.price != null,
    hasMin:
      adv?.minSingleTransAmount != null ||
      adv?.minAmount != null,
    hasMax:
      adv?.maxSingleTransAmount != null ||
      adv?.maxAmount != null,
    hasLiquidity:
      adv?.tradableQuantity != null ||
      adv?.surplusAmount != null ||
      adv?.availableAmount != null,
    hasTradeMethods: Array.isArray(adv?.tradeMethods),
    hasAdvertiser: Boolean(item.advertiser),
    hasOrderCount:
      advertiser?.monthOrderCount != null ||
      advertiser?.monthOrderCount != null,
    hasCompletionRate:
      advertiser?.monthFinishRate != null ||
      advertiser?.positiveRate != null
  };
}

async function probe(name, url, options) {
  const started = Date.now();

  try {
    const response = await fetch(url, {
      ...options,
      redirect: "follow",
      signal: AbortSignal.timeout(15000)
    });

    const text = await response.text();
    const contentType = response.headers.get("content-type") || null;

    let data = null;
    let json = false;

    try {
      data = JSON.parse(text);
      json = true;
    } catch {
      // Intentionally do not expose HTML/body.
    }

    const item = json ? firstItem(data) : null;

    return {
      probe: name,
      http: response.status,
      contentType,
      elapsedMs: Date.now() - started,
      json,
      code: json ? data?.code ?? null : null,
      success: json ? data?.success ?? null : null,
      items: json ? countItems(data) : 0,
      advIds: json ? adIds(data) : [],
      structure: structuralSummary(item),
      transport: {
        server: response.headers.get("server"),
        via: response.headers.get("via"),
        cfRay: response.headers.get("cf-ray"),
        xCache: response.headers.get("x-cache")
      },
      nonJsonBytes: json ? null : Buffer.byteLength(text)
    };
  } catch (error) {
    return {
      probe: name,
      error: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - started
    };
  }
}

async function runProbes() {
  const publicBase = {
    fiat: "BRL",
    asset: "USDT",
    limit: "10"
  };

  const publicBuy = new URL(PUBLIC_URL);
  Object.entries({ ...publicBase, tradeType: "BUY" }).forEach(
    ([key, value]) => publicBuy.searchParams.set(key, value)
  );

  const publicSell = new URL(PUBLIC_URL);
  Object.entries({ ...publicBase, tradeType: "SELL" }).forEach(
    ([key, value]) => publicSell.searchParams.set(key, value)
  );
const publicBuyPix = new URL(publicBuy);
publicBuyPix.searchParams.set("tradeMethodIdentifiers", "Pix");

const publicSellPix = new URL(publicSell);
publicSellPix.searchParams.set("tradeMethodIdentifiers", "Pix");
  const webPayload = (tradeType, pix = false) => ({
  page: 1,
  rows: 20,
  asset: "USDT",
  fiat: "BRL",
  tradeType,
  ...(pix ? { payTypes: ["Pix"] } : {})
});
const quoteBuy = new URL(QUOTE_URL);
quoteBuy.searchParams.set("fiat", "BRL");
quoteBuy.searchParams.set("asset", "USDT");
quoteBuy.searchParams.set("tradeType", "BUY");

const quoteSell = new URL(QUOTE_URL);
quoteSell.searchParams.set("fiat", "BRL");
quoteSell.searchParams.set("asset", "USDT");
quoteSell.searchParams.set("tradeType", "SELL");

const tradeMethodsBrl = new URL(TRADE_METHODS_URL);
tradeMethodsBrl.searchParams.set("fiat", "BRL");
  return Promise.all([probe("QUOTE_PRICE_BUY", quoteBuy, {
  method: "GET",
  headers: {
    accept: "application/json, text/plain, */*",
    "user-agent": browserHeaders["user-agent"]
  }
}),

probe("QUOTE_PRICE_SELL", quoteSell, {
  method: "GET",
  headers: {
    accept: "application/json, text/plain, */*",
    "user-agent": browserHeaders["user-agent"]
  }
}),

probe("TRADE_METHODS_BRL", tradeMethodsBrl, {
  method: "GET",
  headers: {
    accept: "application/json, text/plain, */*",
    "user-agent": browserHeaders["user-agent"]
  }
}),
    probe("PUBLIC_AD_LIST_BUY", publicBuy, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        "user-agent": browserHeaders["user-agent"]
      }
    }),

    probe("PUBLIC_AD_LIST_SELL", publicSell, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        "user-agent": browserHeaders["user-agent"]
      }
    }),
 probe("WEB_ADV_SEARCH_BUY_PAGE_2", WEB_URL, {
  method: "POST",
  headers: browserHeaders,
  body: JSON.stringify({
    ...webPayload("BUY"),
    page: 2
  })
}),

probe("WEB_ADV_SEARCH_BUY_PAGE_3", WEB_URL, {
  method: "POST",
  headers: browserHeaders,
  body: JSON.stringify({
    ...webPayload("BUY"),
    page: 3
  })
}),
    probe("WEB_ADV_SEARCH_BUY", WEB_URL, {
      method: "POST",
      headers: browserHeaders,
      body: JSON.stringify(webPayload("BUY"))
    }),

    probe("WEB_ADV_SEARCH_SELL", WEB_URL, {
      method: "POST",
      headers: browserHeaders,
      body: JSON.stringify(webPayload("SELL"))
    })
 ,

probe("PUBLIC_AD_LIST_BUY_PIX", publicBuyPix, {
  method: "GET",
  headers: {
    accept: "application/json, text/plain, */*",
    "user-agent": browserHeaders["user-agent"]
  }
}),

probe("PUBLIC_AD_LIST_SELL_PIX", publicSellPix, {
  method: "GET",
  headers: {
    accept: "application/json, text/plain, */*",
    "user-agent": browserHeaders["user-agent"]
  }
}),

probe("WEB_ADV_SEARCH_BUY_PIX", WEB_URL, {
  method: "POST",
  headers: browserHeaders,
  body: JSON.stringify(webPayload("BUY", true))
}),

probe("WEB_ADV_SEARCH_SELL_PIX", WEB_URL, {
  method: "POST",
  headers: browserHeaders,
  body: JSON.stringify(webPayload("SELL", true))
}) ]);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200);
    res.end(
      JSON.stringify({
        service: "binance-p2p-runtime-probe",
        status: "ready",
        credentials: false,
        persistence: false,
        instructions: "Open /probe to execute one controlled diagnostic."
      }, null, 2)
    );
    return;
  }

  if (req.method === "GET" && req.url === "/probe") {
    const results = await runProbes();

    res.writeHead(200);
    res.end(
      JSON.stringify({
        runtime: "Render",
        executedAt: new Date().toISOString(),
        market: "USDT/BRL",
        pixFilter: false,
        results
      }, null, 2)
    );
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Probe listening on port ${PORT}`);
});
