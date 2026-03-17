const express = require('express');
const router = express.Router();
const AdminUser = require('../models/AdminUser');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// 로그인
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // 필수 필드 검증
    if (!username || !password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: '사용자명과 비밀번호는 필수입니다.'
      });
    }

    // 사용자 찾기
    const user = await AdminUser.findOne({ username });
    if (!user) {
      return res.status(401).json({
        error: 'Authentication Error',
        message: '사용자명 또는 비밀번호가 잘못되었습니다.'
      });
    }

    // 비밀번호 확인
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        error: 'Authentication Error',
        message: '사용자명 또는 비밀번호가 잘못되었습니다.'
      });
    }

    // JWT 토큰 생성
    const token = jwt.sign(
      { 
        userId: user._id,
        username: user.username,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: '로그인 성공',
      token,
      user: {
        _id: user._id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// 토큰 검증
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
    const user = await AdminUser.findById(decoded.userId);
    
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
        username: user.username,
        role: user.role,
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

module.exports = router;

