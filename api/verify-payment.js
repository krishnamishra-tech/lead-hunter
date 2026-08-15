// POST /api/verify-payment
// Verifies the Razorpay payment signature, then upgrades the CALLER's own
// account (never a client-supplied userId) to the tier they paid for, using
// the Supabase service-role key. The service-role key must NEVER be sent to
// the browser — it only lives here.
//
// SECURITY: a valid signature only proves the payment came from Razorpay —
// it does NOT prove the plan/period the client is now claiming matches what
// was actually paid for. Without checking the order itself, someone could
// pay for Starter-monthly and send { plan: 'business', period: 'yearly' }
// here and get upgraded to the more expensive tier for free. We close that
// by fetching the order from Razorpay and comparing its notes (plan/period/
// userId, set server-side in create-order.js) against the request.
const crypto = require('crypto');
const Razorpay = require('razorpay');
const { verifyUser, supabaseAdmin } = require('./_lib/verifyUser');

const VALID_TIERS = ['starter', 'business'];
const PERIOD_DURATIONS = {
  monthly: (d) => { d.setMonth(d.getMonth() + 1); return d; },
  yearly: (d) => { d.setFullYear(d.getFullYear() + 1); return d; },
};
const PLAN_AMOUNTS_RUPEES = {
  starter: { monthly: 499, yearly: 4999 },
  business: { monthly: 999, yearly: 9999 },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const user = await verifyUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please sign in to verify payment' });
    return;
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      plan,
      period,
    } = req.body || {};

    if (
      !razorpay_order_id || !razorpay_payment_id || !razorpay_signature ||
      !VALID_TIERS.includes(plan) || !PERIOD_DURATIONS[period]
    ) {
      res.status(400).json({ error: 'Missing or invalid fields' });
      return;
    }

    // 1. Verify the payment actually came from Razorpay and wasn't tampered with.
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      res.status(400).json({ error: 'Invalid payment signature' });
      return;
    }

    // 2. Fetch the actual order from Razorpay and confirm it matches what's
    //    being claimed here — this is the check that was missing before.
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const order = await razorpay.orders.fetch(razorpay_order_id);

    if (!order || !order.notes) {
      res.status(400).json({ error: 'Could not verify order details' });
      return;
    }
    if (order.notes.plan !== plan || order.notes.period !== period) {
      console.warn(`Plan mismatch on verify: order was for ${order.notes.plan}/${order.notes.period}, request claimed ${plan}/${period}, user ${user.id}`);
      res.status(400).json({ error: 'Order does not match the requested plan' });
      return;
    }
    if (order.notes.userId && order.notes.userId !== user.id) {
      console.warn(`User mismatch on verify: order was created by ${order.notes.userId}, verified by ${user.id}`);
      res.status(400).json({ error: 'This order belongs to a different account' });
      return;
    }
    // Defense in depth: also confirm Razorpay itself shows the order as paid
    // and the full amount was captured (not a partial/failed payment).
    if (order.status !== 'paid' || order.amount_paid < order.amount) {
      res.status(400).json({ error: 'Payment not confirmed as paid' });
      return;
    }

    // 3. Compute new plan expiry.
    const expiry = PERIOD_DURATIONS[period](new Date());

    // 4. Upgrade the AUTHENTICATED CALLER's own profile to the tier they
    //    paid for — user.id comes from the verified token, not from
    //    anything the client sent.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ plan, plan_expiry: expiry.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (profileError) throw profileError;

    // 5. Log the payment for your own records.
    const { error: paymentError } = await supabaseAdmin.from('payments').insert({
      user_id: user.id,
      razorpay_order_id,
      razorpay_payment_id,
      amount: PLAN_AMOUNTS_RUPEES[plan][period],
      plan_purchased: `${plan}_${period}`,
      status: 'paid',
    });
    if (paymentError) console.error('payments log error:', paymentError);

    res.status(200).json({ success: true, plan, planExpiry: expiry.toISOString() });
  } catch (err) {
    console.error('verify-payment error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
};
