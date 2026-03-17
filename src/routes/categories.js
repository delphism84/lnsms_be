const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const Menu = require('../models/Menu');

// 특정 스토어의 모든 카테고리 조회
router.get('/store/:storeId', async (req, res) => {
  try {
    const categories = await Category.find({ storeId: req.params.storeId })
      .sort({ order: 1, createdAt: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 카테고리 조회
router.get('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 카테고리 생성
router.post('/', async (req, res, next) => {
  try {
    const { storeId, name } = req.body;
    
    if (!storeId || !name) {
      return res.status(400).json({ error: '스토어 ID와 이름은 필수입니다.' });
    }

    const category = new Category(req.body);
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

// 카테고리 수정
router.put('/:id', async (req, res) => {
  try {
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 카테고리 삭제 (연관된 메뉴도 함께 삭제)
router.delete('/:id', async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // 연관된 메뉴 삭제
    await Menu.deleteMany({ categoryId: req.params.id });
    
    // 카테고리 삭제
    await Category.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Category and associated menus deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

