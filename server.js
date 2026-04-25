require("dotenv").config();
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

/* ----------------------------------
   BASIC TEST ROUTE
-----------------------------------*/
app.get("/test", (req, res) => {
  res.json({
    success: true,
    verificationTokenFound: !!process.env.EBAY_VERIFICATION_TOKEN,
  });
});

/* ----------------------------------
   EBAY ACCOUNT DELETION ENDPOINT
-----------------------------------*/
app.get("/ebay/account-deletion", (req, res) => {
  const challengeCode = req.query.challenge_code;
  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;

  if (!challengeCode || !verificationToken) {
    return res
      .status(400)
      .json({ error: "missing challenge_code or verification token" });
  }

  const endpoint = "https://nes-price-tracker.onrender.com/ebay/account-deletion";

  const hash = crypto
    .createHash("sha256")
    .update(challengeCode + verificationToken + endpoint)
    .digest("hex");

  res.json({
    challengeResponse: hash,
  });
});

/* ----------------------------------
   GET EBAY APP TOKEN
-----------------------------------*/
app.get("/token", async (req, res) => {
  try {
    const auth = Buffer.from(
      `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
    ).toString("base64");

    const response = await axios.post(
      "https://api.ebay.com/identity/v1/oauth2/token",
      "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: "token request failed",
      details: error.response?.data || error.message,
    });
  }
});

/* ----------------------------------
   SEARCH NES GAME PRICES
   Example:
   /search?q=mega man
-----------------------------------*/
app.get("/search", async (req, res) => {
  try {
    const query = req.query.q || "Nintendo NES";

    const auth = Buffer.from(
      `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
    ).toString("base64");

    const tokenResponse = await axios.post(
      "https://api.ebay.com/identity/v1/oauth2/token",
      "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const token = tokenResponse.data.access_token;

    const searchResponse = await axios.get(
      "https://api.ebay.com/buy/browse/v1/item_summary/search",
      {
        params: {
          q: query,
          limit: 10,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    res.json(searchResponse.data);
  } catch (error) {
    res.status(500).json({
      error: "search failed",
      details: error.response?.data || error.message,
    });
  }
});

/* ----------------------------------
   HOME PAGE
-----------------------------------*/
app.get("/", (req, res) => {
  res.send("NES Price Tracker API is running.");
});

/* ----------------------------------
   START SERVER
-----------------------------------*/
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
