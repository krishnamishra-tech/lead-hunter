// POST /api/verify-payment
// Verifies the Razorpay payment signature, then upgrades the CALLER's own
// account (never a client-supplied userId) to the tier they paid for, using
// the Supabase service-role key. The service-role key must NEVER be sent to
// the browser — it only lives here.
const crypto = require('crypto');
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

    // 2. Compute new plan expiry.
    const expiry = PERIOD_DURATIONS[period](new Date());

    // 3. Upgrade the AUTHENTICATED CALLER's own profile to the tier they
    //    paid for — user.id comes from the verified token, not from
    //    anything the client sent.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ plan, plan_expiry: expiry.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', user.id);
    if (profileError) throw profileError;

    // 4. Log the payment for your own records.
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
