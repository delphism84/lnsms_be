const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// 회원가입
router.post('/register', async (req, res, next) => {
  try {
    const agentId = String(req.body.agentId || req.body.agentid || '').trim();
    const password = req.body.userpw ?? req.body.pw;

    // 필수 필드 검증
    if (!agentId || !password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'agentId와 userpw(pw)는 필수입니다.'
      });
    }

    // 중복 확인
    const existingUser = await User.findOne({ $or: [{ agentId }, { agentid: agentId }] });
    if (existingUser) {
      return res.status(400).json({
        error: 'Duplicate User',
        message: '이미 존재하는 Agent ID입니다.'
      });
    }

    // 사용자 생성 (비밀번호는 모델에서 자동 해싱)
    const user = new User({
      agentId,
      agentid: agentId,
      // 표준/레거시 모두 채워 호환 유지
      userpw: password,
      pw: password
    });

    await user.save();

    // JWT 토큰 생성
    const token = jwt.sign(
      { 
        userId: user._id,
        agentId: user.agentId || user.agentid
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: '회원가입이 완료되었습니다.',
      token,
      user: {
        _id: user._id,
        agentId: user.agentId || user.agentid,
        agentid: user.agentId || user.agentid,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        error: 'Duplicate User',
        message: '이미 존재하는 Agent ID입니다.'
      });
    }
    next(error);
  }
});

// 로그인
router.post('/login', async (req, res, next) => {
  try {
    const agentId = String(req.body.agentId || req.body.agentid || '').trim();
    const password = req.body.userpw ?? req.body.pw;

    // 필수 필드 검증
    if (!agentId || !password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'agentId와 userpw(pw)는 필수입니다.'
      });
    }

    // 사용자 찾기
    const user = await User.findOne({ $or: [{ agentId }, { agentid: agentId }] });
    if (!user) {
      return res.status(401).json({
        error: 'Authentication Error',
        message: 'Agent ID 또는 비밀번호가 잘못되었습니다.'
      });
    }

    // 비밀번호 확인
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        error: 'Authentication Error',
        message: 'Agent ID 또는 비밀번호가 잘못되었습니다.'
      });
    }

    // JWT 토큰 생성
    const token = jwt.sign(
      { 
        userId: user._id,
        agentId: user.agentId || user.agentid
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: '로그인 성공',
      token,
      user: {
        _id: user._id,
        agentId: user.agentId || user.agentid,
        agentid: user.agentId || user.agentid,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// 토큰 검증 (선택적)
router.get('/verify', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        error: 'Authentication Error',
        message: '토큰이 제공되지 않았습니다.'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        error: 'Authentication Error',
        message: '사용자를 찾을 수 없습니다.'
      });
    }

    res.json({
      valid: true,
      user: {
        _id: user._id,
        agentId: user.agentId || user.agentid,
        agentid: user.agentId || user.agentid,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Authentication Error',
        message: '유효하지 않은 토큰입니다.'
      });
    }
    next(error);
  }
});

// 비밀번호 변경
router.put('/password', async (req, res, next) => {
  try {
    const agentId = String(req.body.agentId || req.body.agentid || '').trim();
    const password = req.body.userpw ?? req.body.pw;

    if (!agentId || !password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'agentId와 userpw(pw)는 필수입니다.'
      });
    }

    const user = await User.findOne({ $or: [{ agentId }, { agentid: agentId }] });
    if (!user) {
      return res.status(404).json({
        error: 'User Not Found',
        message: 'Agent ID를 찾을 수 없습니다.'
      });
    }

    // 표준/레거시 모두 갱신 (모델 pre-save hook에서 해싱 + userpworg 저장)
    user.userpw = password;
    user.pw = password;
    await user.save();

    res.json({
      message: '비밀번호가 변경되었습니다.',
      user: {
        _id: user._id,
        agentId: user.agentId || user.agentid,
        agentid: user.agentId || user.agentid,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

