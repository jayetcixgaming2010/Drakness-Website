// netlify/functions/api.js
const express = require('express');
const mongoose = require('mongoose');
const serverless = require('serverless-http');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let cachedDb = null;

async function connectDB() {
  if (cachedDb) return cachedDb;
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 5,  // Giới hạn pool nhỏ cho serverless
    minPoolSize: 1
  });
  cachedDb = mongoose.connection;
  console.log('MongoDB connected');
  return cachedDb;
}

const UserSchema = new mongoose.Schema({
  ip: String,
  key: String,
  completed: Boolean,
  createdAt: Date,
  expiresAt: { type: Date, index: { expires: '0' } }
});
const User = mongoose.model('User', UserSchema);

app.post('/start', async (req, res) => {
  await connectDB();
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
  let user = await User.findOne({ ip });

  if (!user) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomPart = '';
    for (let i = 0; i < 10; i++) randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    const newKey = `Drakness_${randomPart}`;
    user = new User({ ip, key: newKey, completed: false, createdAt: new Date(), expiresAt: new Date(Date.now() + 24*60*60*1000) });
    await user.save();
  }

  res.redirect(`/verify?key=${encodeURIComponent(user.key)}&completed=${user.completed}`);
});

app.get('/verify', async (req, res) => {
  // Không cần render EJS nữa, chỉ redirect hoặc trả HTML tĩnh
  res.redirect('/verify.html');  // public/verify.html sẽ tự lấy ?key từ URL
});

app.post('/api/complete-task', async (req, res) => {
  await connectDB();
  const { key } = req.body;
  if (!key) return res.json({ success: false, message: 'Thiếu key' });

  const user = await User.findOne({ key });
  if (!user) return res.json({ success: false, message: 'Key không tồn tại' });

  if (new Date() > user.expiresAt) return res.json({ success: false, message: 'Key đã hết hạn' });

  if (user.completed) return res.json({ success: true });

  user.completed = true;
  await user.save();

  res.json({ success: true });
});

app.get('/api/check-key', async (req, res) => {
  await connectDB();
  const { key } = req.query;
  if (!key) return res.json({ valid: false, message: 'Vui lòng nhập key' });

  const user = await User.findOne({ key });
  if (!user) return res.json({ valid: false, message: 'Key không tồn tại hoặc đã hết hạn' });

  if (new Date() > user.expiresAt) return res.json({ valid: false, message: 'Key đã hết hạn (24 tiếng)' });

  if (!user.completed) return res.json({ valid: false, message: 'Chưa hoàn thành nhiệm vụ' });

  res.json({ valid: true, message: 'Key hợp lệ!' });
});

// Xử lý tất cả route khác
app.use((req, res) => res.status(404).send('Not Found'));

module.exports.handler = serverless(app);
