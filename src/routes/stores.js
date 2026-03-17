const express = require('express');
const router = express.Router();
const Store = require('../models/Store');
const Category = require('../models/Category');
const Menu = require('../models/Menu');
const Device = require('../models/Device');

// 모든 Agent ID 조회 (레거시 호환)
// 표준은 /api/agents 를 사용하세요.
router.get('/', async (req, res) => {
  try {
    const idsStd = await Store.distinct('agentId');
    const idsLegacy = await Store.distinct('agentid');
    const set = new Set([...(idsStd || []), ...(idsLegacy || [])].filter(Boolean));
    const agentIds = Array.from(set).sort();
    res.json(agentIds.map((agentId) => ({ agentId, agentid: agentId })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 모든 Store 조회 (DID/관리화면용)
router.get('/all', async (req, res) => {
  try {
    const stores = await Store.find({}).sort({ agentId: 1, storeId: 1, agentid: 1, userid: 1, createdAt: -1 });
    res.json(stores);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 Agent ID의 모든 Store 조회 (Store ID 목록)
router.get('/agent/:agentId', async (req, res) => {
  try {
    const agentId = String(req.params.agentId || '').trim();
    const stores = await Store.find({ $or: [{ agentId }, { agentid: agentId }] })
      .sort({ storeId: 1, userid: 1, createdAt: -1 });
    res.json(stores);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 스토어 조회 (agentId + storeId)
router.get('/agent/:agentId/store/:storeId', async (req, res) => {
  try {
    const agentId = String(req.params.agentId || '').trim();
    const storeId = String(req.params.storeId || '').trim();
    const store = await Store.findOne({
      $or: [
        { agentId, storeId },
        { agentid: agentId, userid: storeId },
      ],
    });
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }
    res.json(store);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 레거시: 특정 스토어 조회 (agentid + userid)
router.get('/agent/:agentid/user/:userid', async (req, res) => {
  try {
    const store = await Store.findOne({
      agentid: req.params.agentid,
      userid: req.params.userid,
    });
    if (!store) return res.status(404).json({ error: 'Store not found' });
    res.json(store);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 스토어 조회 (eqid로 - DID FE용)
router.get('/eqid/:eqid', async (req, res) => {
  try {
    const store = await Store.findOne({ eqid: req.params.eqid });
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }
    res.json(store);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 스토어 조회 (ID로)
router.get('/:id', async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }
    res.json(store);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 스토어 생성
router.post('/', async (req, res, next) => {
  try {
    const agentId = String(req.body.agentId || req.body.agentid || '').trim();
    const storeId = String(req.body.storeId || req.body.userid || '').trim();
    const { name } = req.body;
    
    if (!agentId || !storeId || !name) {
      return res.status(400).json({ error: 'Agent ID, Store ID, 이름은 필수입니다.' });
    }

    // agentId와 storeId 조합 중복 확인 (표준/레거시 모두)
    const existingStore = await Store.findOne({
      $or: [
        { agentId, storeId },
        { agentid: agentId, userid: storeId },
      ],
    });
    if (existingStore) {
      return res.status(400).json({ error: '이미 존재하는 Agent ID와 Store ID 조합입니다.' });
    }

    const store = new Store({
      ...req.body,
      agentId,
      storeId,
      agentid: agentId,
      userid: storeId,
    });
    await store.save();
    res.status(201).json(store);
  } catch (error) {
    // 유니크 제약 조건 위반 처리
    if (error.code === 11000) {
      return res.status(400).json({ error: '이미 존재하는 Agent ID와 Store ID 조합입니다.' });
    }
    next(error);
  }
});

// 스토어 수정
router.put('/:id', async (req, res, next) => {
  try {
    const agentId = req.body.agentId || req.body.agentid;
    const storeId = req.body.storeId || req.body.userid;
    
    // agentId와 storeId 변경 시 중복 확인
    if (agentId && storeId) {
      const existingStore = await Store.findOne({ 
        $or: [
          { agentId, storeId },
          { agentid: agentId, userid: storeId },
        ],
        _id: { $ne: req.params.id } 
      });
      if (existingStore) {
        return res.status(400).json({ error: '이미 존재하는 Agent ID와 Store ID 조합입니다.' });
      }
    }

    const store = await Store.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        ...(agentId ? { agentId: String(agentId).trim(), agentid: String(agentId).trim() } : {}),
        ...(storeId ? { storeId: String(storeId).trim(), userid: String(storeId).trim() } : {}),
      },
      { new: true, runValidators: true }
    );
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }
    res.json(store);
  } catch (error) {
    // 유니크 제약 조건 위반 처리
    if (error.code === 11000) {
      return res.status(400).json({ error: '이미 존재하는 Agent ID와 Store ID 조합입니다.' });
    }
    next(error);
  }
});

// 스토어(매장) 비밀번호 변경
router.put('/:id/password', async (req, res, next) => {
  try {
    const password = req.body.userpw ?? req.body.pw;
    if (!password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'pw(userpw)는 필수입니다.',
      });
    }

    const store = await Store.findById(req.params.id);
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // 표준/레거시 모두 갱신 (모델 pre-save hook에서 해싱 + userpworg 저장)
    store.userpw = password;
    store.pw = password;
    await store.save();

    res.json({
      message: '비밀번호가 변경되었습니다.',
      store: {
        _id: store._id,
        agentId: store.agentId || store.agentid,
        storeId: store.storeId || store.userid,
        updatedAt: store.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// 스토어 삭제
router.delete('/:id', async (req, res) => {
  try {
    const store = await Store.findById(req.params.id);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    // 연쇄 삭제(cascade): 메뉴 → 카테고리 → EQID(Device) → Store
    const storeId = store._id;
    const storeIdStr = String(store.storeId || store.userid || '').trim();

    const menusResult = await Menu.deleteMany({ storeId });
    const categoriesResult = await Category.deleteMany({ storeId });

    const deviceQuery = {
      $or: [
        { storeRef: storeId },
        { storeIdLegacy: storeId },
        ...(storeIdStr ? [{ storeId: storeIdStr }] : []),
        ...(store.userid ? [{ storeId: String(store.userid) }] : []),
      ],
    };
    const devicesResult = await Device.deleteMany(deviceQuery);

    await Store.findByIdAndDelete(storeId);

    res.json({
      message: 'Store deleted successfully (cascade)',
      deleted: {
        menus: menusResult?.deletedCount || 0,
        categories: categoriesResult?.deletedCount || 0,
        devices: devicesResult?.deletedCount || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

