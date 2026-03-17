const express = require('express');
const router = express.Router();
const Menu = require('../models/Menu');

// 특정 카테고리의 모든 메뉴 조회
router.get('/category/:categoryId', async (req, res) => {
  try {
    const menus = await Menu.find({ categoryId: req.params.categoryId })
      .sort({ order: 1, createdAt: 1 })
      .populate('categoryId', 'name')
      .populate('storeId', 'name agentid userid');
    res.json(menus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 스토어의 모든 메뉴 조회
router.get('/store/:storeId', async (req, res) => {
  try {
    const menus = await Menu.find({ storeId: req.params.storeId })
      .sort({ order: 1, createdAt: 1 })
      .populate('categoryId', 'name')
      .populate('storeId', 'name agentid userid');
    res.json(menus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 메뉴 조회
router.get('/:id', async (req, res) => {
  try {
    const menu = await Menu.findById(req.params.id)
      .populate('categoryId', 'name')
      .populate('storeId', 'name agentid userid');
    if (!menu) {
      return res.status(404).json({ error: 'Menu not found' });
    }
    res.json(menu);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 메뉴 생성
router.post('/', async (req, res, next) => {
  try {
    const { categoryId, storeId, name } = req.body;
    
    if (!categoryId || !storeId || !name) {
      return res.status(400).json({ error: '카테고리 ID, 스토어 ID, 이름은 필수입니다.' });
    }

    const menu = new Menu(req.body);
    await menu.save();
    const populatedMenu = await Menu.findById(menu._id)
      .populate('categoryId', 'name')
      .populate('storeId', 'name agentid userid');
    res.status(201).json(populatedMenu);
  } catch (error) {
    next(error);
  }
});

// 메뉴 수정
router.put('/:id', async (req, res) => {
  try {
    const menu = await Menu.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('categoryId', 'name')
     .populate('storeId', 'name eqid');
    
    if (!menu) {
      return res.status(404).json({ error: 'Menu not found' });
    }
    res.json(menu);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 메뉴 삭제
router.delete('/:id', async (req, res) => {
  try {
    const menu = await Menu.findByIdAndDelete(req.params.id);
    if (!menu) {
      return res.status(404).json({ error: 'Menu not found' });
    }
    res.json({ message: 'Menu deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 메뉴에 리소스 추가
router.post('/:id/resources', async (req, res) => {
  try {
    const menu = await Menu.findById(req.params.id);
    if (!menu) {
      return res.status(404).json({ error: 'Menu not found' });
    }
    
    menu.resources.push(req.body);
    await menu.save();
    
    const populatedMenu = await Menu.findById(menu._id)
      .populate('categoryId', 'name')
      .populate('storeId', 'name agentid userid');
    
    res.json(populatedMenu);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 메뉴의 리소스 삭제
router.delete('/:id/resources/:resourceIndex', async (req, res) => {
  try {
    const menu = await Menu.findById(req.params.id);
    if (!menu) {
      return res.status(404).json({ error: 'Menu not found' });
    }
    
    const resourceIndex = parseInt(req.params.resourceIndex);
    if (resourceIndex < 0 || resourceIndex >= menu.resources.length) {
      return res.status(400).json({ error: 'Invalid resource index' });
    }
    
    menu.resources.splice(resourceIndex, 1);
    await menu.save();
    
    const populatedMenu = await Menu.findById(menu._id)
      .populate('categoryId', 'name')
      .populate('storeId', 'name agentid userid');
    
    res.json(populatedMenu);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;

