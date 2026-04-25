require('dotenv').config();

const express = require('express');
const axios = require('axios');

const app = express();
const PORT = 3000;

function getEbayUrls() {
  const isSandbox = process.env.EBAY_ENV === 'sandbox';

  return {
    tokenUrl: isSandbox
      ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
      : 'https://api.ebay.com/identity/v1/oauth2/token',

    browseSearchUrl: isSandbox
      ? 'https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search'
      : 'https://api.ebay.com/buy/browse/v1/item_summary/search'
  };
}

async function getEbayToken() {
  const auth = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString('base64');

  const { tokenUrl } = getEbayUrls();

  const response = await axios.post(
    tokenUrl,
    'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  return response.data.access_token;
}

app.get('/', (req, res) => {
  res.send('NES Price Tracker server is alive.');
});

app.get('/test', (req, res) => {
  res.json({
    success: true,
    clientIdFound: !!process.env.EBAY_CLIENT_ID,
    secretFound: !!process.env.EBAY_CLIENT_SECRET,
    env: process.env.EBAY_ENV
  });
});

app.get('/token', async (req, res) => {
  try {
    const token = await getEbayToken();

    res.json({
      success: true,
      message: 'Token received successfully.',
      access_token_preview: token.substring(0, 20) + '...'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Token request failed',
      details: error.response?.data || error.message
    });
  }
});

app.get('/search', async (req, res) => {
  try {
    const token = await getEbayToken();
    const { browseSearchUrl } = getEbayUrls();

    const query = req.query.q || 'Super Mario Bros 3 NES';

    const response = await axios.get(browseSearchUrl, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      params: {
        q: query,
        limit: 10
      }
    });

    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: 'Search failed',
      details: error.response?.data || error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});