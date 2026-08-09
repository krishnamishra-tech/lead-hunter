// POST /api/create-order
// Creates a Razorpay order for the chosen plan tier + billing period. Runs
// server-side only — this is where RAZORPAY_KEY_SECRET lives, never in the
// browser.
//
// PRICING (source of truth — keep in sync with PLAN_LIMITS/PLAN_LABELS in
// app.html if those numbers ever change):
//   Starter:  ₹499/month   or ₹4,999/year  (1,000 leads/month)
//   Business: ₹999/month   or ₹9,999/year  (2,000 leads/month)
//
// SECURITY: the userId is taken from the verified Supabase login token, NOT
// from the request body. If we trusted a client-supplied userId here, anyone
// could pass a different account's ID and (after paying) upgrade someone
// else's account instead of their own — or worse, be used to probe for
// valid user IDs. Deriving it from the verified session closes that off.
const Razorpay = require('razorpay');
const { verifyUser } = require('./_lib/verifyUser');

const PLAN_PRICING = {
  starter: { monthly: 49900, yearly: 499900 },   // paise: ₹499 / ₹4,999
  business: { monthly: 99900, yearly: 999900 },  // paise: ₹999 / ₹9,999
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await verifyUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please sign in to upgrade' });
    return;
  }

  try {
    const { plan, period } = req.body || {};
    const tierPricing = PLAN_PRICING[plan];
    const amount = tierPricing && tierPricing[period];
    if (!amount) {
      res.status(400).json({ error: 'Invalid plan or billing period' });
      return;
    }

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `ls_${user.id.slice(0, 8)}_${Date.now()}`,
      notes: { userId: user.id, plan, period, product: 'LocalScout' },
    });

    res.status(200).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID, // public key — safe to expose to the browser
    });
  } catch (err) {
    console.error('create-order error:', err);
    res.status(500).json({ error: 'Could not create order' });
  }
};
