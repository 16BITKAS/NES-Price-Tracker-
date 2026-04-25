require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const EBAY_ENDPOINT = "https://nes-price-tracker.onrender.com/ebay/account-deletion";
const priceCache = new Map();
const CACHE_MS = 6 * 60 * 60 * 1000;

function median(numbers) {
  const clean = numbers.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}
function average(numbers) {
  const clean = numbers.filter(n => Number.isFinite(n));
  if (!clean.length) return null;
  return clean.reduce((a, b) => a + b, 0) / clean.length;
}
function isBadListing(title) {
  const t = String(title || "").toLowerCase();
  const badWords = ["manual", "box only", "case only", "replacement", "reproduction", "repro", "homebrew", "poster", "sticker", "label", "shell", "sleeve", "protector", "lot of", "bundle", "choose", "pick", "read description", "not working", "damaged", "for parts", "untested", "rom", "everdrive", "famicom"];
  return badWords.some(w => t.includes(w));
}
async function getEbayToken() {
  const auth = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const response = await axios.post("https://api.ebay.com/identity/v1/oauth2/token", "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope", { headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" }});
  return response.data.access_token;
}
app.get("/test", (req, res) => res.json({ success: true, clientIdFound: !!process.env.EBAY_CLIENT_ID, clientSecretFound: !!process.env.EBAY_CLIENT_SECRET, verificationTokenFound: !!process.env.EBAY_VERIFICATION_TOKEN, env: process.env.EBAY_ENV || "production" }));
app.get("/token", async (req, res) => { try { const token = await getEbayToken(); res.json({ success: true, access_token_preview: token.slice(0, 24) + "..." }); } catch (error) { res.status(500).json({ error: "token request failed", details: error.response?.data || error.message }); }});
app.get("/search", async (req, res) => { try { const q = req.query.q || "Super Mario Bros 3 NES"; const token = await getEbayToken(); const response = await axios.get("https://api.ebay.com/buy/browse/v1/item_summary/search", { params: { q, limit: req.query.limit || 10 }, headers: { Authorization: `Bearer ${token}` }}); res.json(response.data); } catch (error) { res.status(500).json({ error: "search failed", details: error.response?.data || error.message }); }});
app.get("/api/price", async (req, res) => {
  try {
    const title = String(req.query.title || "").trim();
    if (!title) return res.status(400).json({ error: "Missing title" });
    const cacheKey = title.toLowerCase();
    const cached = priceCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_MS) return res.json({ ...cached.data, cached: true });
    const token = await getEbayToken();
    const q = `${title} NES cartridge`;
    const response = await axios.get("https://api.ebay.com/buy/browse/v1/item_summary/search", { params: { q, limit: 50, filter: "buyingOptions:{FIXED_PRICE}" }, headers: { Authorization: `Bearer ${token}` }});
    const rawItems = response.data.itemSummaries || [];
    const items = rawItems.filter(item => item.price?.currency === "USD").filter(item => !isBadListing(item.title)).map(item => ({ title: item.title, price: Number(item.price.value), currency: item.price.currency, condition: item.condition, url: item.itemWebUrl, image: item.image?.imageUrl || "" })).filter(item => Number.isFinite(item.price) && item.price > 0).sort((a, b) => a.price - b.price);
    const prices = items.map(i => i.price);
    const data = { title, query: q, estimate: median(prices), average: average(prices), low: prices.length ? prices[0] : null, high: prices.length ? prices[prices.length - 1] : null, resultCount: items.length, sampleListings: items.slice(0, 5), updatedAt: new Date().toISOString(), note: "Estimate uses active eBay fixed-price listings, filtered for loose cartridge-style results. Sold-price endpoint can be added later if your eBay access supports it." };
    priceCache.set(cacheKey, { data, cachedAt: Date.now() });
    res.json(data);
  } catch (error) { res.status(500).json({ error: "price lookup failed", details: error.response?.data || error.message }); }
});
app.get("/ebay/account-deletion", (req, res) => { const challengeCode = req.query.challenge_code; const verificationToken = process.env.EBAY_VERIFICATION_TOKEN; if (!challengeCode || !verificationToken) return res.status(400).json({ error: "missing challenge_code or verification token" }); const hash = crypto.createHash("sha256").update(challengeCode + verificationToken + EBAY_ENDPOINT).digest("hex"); res.json({ challengeResponse: hash }); });
app.post("/ebay/account-deletion", (req, res) => { console.log("Received eBay account deletion notification:", req.body); res.status(200).json({ status: "received" }); });
app.get("/", (req, res) => res.sendFile(__dirname + "/public/index.html"));
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
