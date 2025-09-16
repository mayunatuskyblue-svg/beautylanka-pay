import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';

const app = express();

// ====== 必要な環境変数 ======
const {
  sk_test_51S59dhHFHLP5RXi1ytCFvH6DfiUPMNSH2dq2y04wo0tx95Im40Th3NZcQuISAwIV6s1hcaOViRTzZFI0zWkMq8Kd00EhfoLpMC,        
  https://beauty-frontend.onrender.com/,          // 例: https://beauty-frontend.onrender.com, http://localhost:5173
  bl_admin_dev_1234567890abcdef1234567890abcdef         // 後課金API用の管理トークン（長い英数ランダム文字列）
} = process.env;

if(!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is required');
if(!ADMIN_TOKEN) console.warn('⚠ ADMIN_TOKEN 未設定。/api/charge を誰でも叩けます。必ず設定推奨！');

const stripe = new Stripe(sk_test_51S59dhHFHLP5RXi1ytCFvH6DfiUPMNSH2dq2y04wo0tx95Im40Th3NZcQuISAwIV6s1hcaOViRTzZFI0zWkMq8Kd00EhfoLpMC);

// CORS（フロントの origin を列挙）
const origins = (https://beauty-frontend.onrender.com/ || '').split(',').map(s=>s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb)=>{
    if(!origin) return cb(null, true);
    if(origins.length===0 || origins.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked: '+origin));
  }
}));
app.use(express.json());

// ヘルスチェック
app.get('/health', (req,res)=>res.json({ok:true}));

// 1) カード保存: SetupIntent を発行（client_secret と customerId を返す）
app.post('/api/setup-intent', async (req, res) => {
  try {
    const { email, name } = req.body || {};
    if(!email) throw new Error('email required');

    // 既存Customerがあれば再利用
    let customer = (await stripe.customers.list({ email, limit:1 })).data[0];
    if(!customer) customer = await stripe.customers.create({ email, name: name||undefined });

    const si = await stripe.setupIntents.create({
      customer: customer.id,
      usage: 'off_session'
    });

    res.json({ ok:true, customerId: customer.id, clientSecret: si.client_secret });
  } catch (e) {
    res.status(400).json({ ok:false, error: String(e) });
  }
});

// 2) 施術後の後課金: 保存済みデフォルト支払い方法で即時請求
app.post('/api/charge', async (req, res) => {
  try {
    // 簡易認証（必須推奨）
    if(bl_admin_dev_1234567890abcdef1234567890abcdef && req.headers['x-admin-token'] !== bl_admin_dev_1234567890abcdef1234567890abcdef){
      return res.status(401).json({ ok:false, error:'unauthorized' });
    }

    const { customerId, amountJPY, description, idempotencyKey } = req.body || {};
    if(!customerId) throw new Error('customerId required');
    if(!Number.isInteger(amountJPY)) throw new Error('amountJPY must be integer (JPY)');

    const pi = await stripe.paymentIntents.create({
      customer: customerId,
      amount: amountJPY,
      currency: 'jpy',
      confirm: true,
      off_session: true,
      description: description || 'Beauty Lanka service'
    }, idempotencyKey ? { idempotencyKey } : undefined);

    res.json({ ok:true, paymentIntentId: pi.id, status: pi.status });
  } catch (e) {
    // 3Dセキュア必要などで失敗する場合あり
    res.status(400).json({ ok:false, error: String(e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, ()=> console.log('pay server on :'+port));
