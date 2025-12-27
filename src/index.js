require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// mongodb 연결
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongodb:27017/lnsms';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('MongoDB 연결 성공');
})
.catch((err) => {
  console.error('MongoDB 연결 실패:', err);
});

// 기본 라우트
app.get('/', (req, res) => {
  res.json({ message: 'LNSMS Backend API' });
});

// health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});

