require('dotenv').config();

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const PUBLIC_ENDPOINT =
  'https://nes-price-tracker.onrender.com/ebay/account-deletion';

app.get('/', (req, res) => {
  res.send('NES Price Tracker server is alive.');
});

app.get('/test', (req, res) => {
  res.json({
    success: true,
    verificationTokenFound: !!process.env.EBAY_VERIFICATION_TOKEN
  });
});

// eBay verification challenge endpoint
app.get('/ebay/account-deletion', (req, res) => {
  const challengeCode = req.query.challenge_code;
  const verificationToken = process.env.EBAY_VERIFICATION_TOKEN;

  if (!challengeCode || !verificationToken) {
    return res.status(400).json({
      error: 'Missing challenge_code or verification token'
    });
  }

  const hash = crypto
    .createHash('sha256')
    .update(challengeCode + verificationToken + PUBLIC_ENDPOINT)
    .digest('hex');

  res.status(200).json({
    challengeResponse: hash
  });
});

// eBay will POST deletion notifications here later
app.post('/ebay/account-deletion', (req, res) => {
  console.log('Received eBay account deletion notification:', req.body);

  res.status(200).json({
    status: 'received'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
