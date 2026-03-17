const express = require('express');
const router = express.Router();
const Store = require('../models/Store');
const User = require('../models/User');
const Category = require('../models/Category');
const Menu = require('../models/Menu');
const Device = require('../models/Device');

// Agent 목록 조회 (표준: agentId)
router.get('/', async (req, res) => {
  try {
    // 표준 필드 우선, 없으면 레거시 필드로 폴백
    const idsStd = await Store.distinct('agentId');
    const idsLegacy = await Store.distinct('agentid');
    const set = new Set([...(idsStd || []), ...(idsLegacy || [])].filter(Boolean));
    const agentIds = Array.from(set).sort();
    res.json(agentIds.map((agentId) => ({ agentId })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 에이전트 상세 조회 (aget/users 테이블)
router.get('/:agentId', async (req, res) => {
  try {
    const agentId = String(req.params.agentId || '').trim();
    if (!agentId) return res.status(400).json({ error: 'Validation Error', message: 'agentId는 필수입니다.' });

    const user = await User.findOne({ $or: [{ agentId }, { agentid: agentId }] });
    // user 문서가 없어도(스토어만 존재하는 환경) 모달을 열 수 있게 기본값을 반환
    if (!user) return res.json({ agentId, agentid: agentId });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 에이전트 상세 수정(또는 생성)
// - 비밀번호 변경은 /api/auth/password 를 사용 (여기서는 pw/userpw 업데이트 금지)
router.put('/:agentId', async (req, res, next) => {
  try {
    const agentId = String(req.params.agentId || '').trim();
    if (!agentId) {
      return res.status(400).json({ error: 'Validation Error', message: 'agentId는 필수입니다.' });
    }

    const incoming = { ...(req.body || {}) };
    // password fields are handled elsewhere (avoid accidental plaintext writes)
    delete incoming.userpw;
    delete incoming.pw;
    delete incoming.userpworg;
    delete incoming._id;
    delete incoming.__v;

    let user = await User.findOne({ $or: [{ agentId }, { agentid: agentId }] });

    // create if missing
    if (!user) {
      user = new User({
        ...incoming,
        agentId,
        agentid: agentId,
      });
      await user.save();
      return res.status(201).json(user);
    }

    Object.assign(user, incoming, { agentId, agentid: agentId });
    await user.save();
    res.json(user);
  } catch (error) {
    // 유니크 제약 조건 위반 처리
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Duplicate User', message: '이미 존재하는 Agent ID입니다.' });
    }
    next(error);
  }
});

// 에이전트 삭제 (연쇄 삭제)
// - 에이전트(User) 삭제
// - 해당 agentId의 모든 Store 삭제
// - 해당 Store에 연결된 Category/Menu/Device(eqids) 삭제
router.delete('/:agentId', async (req, res) => {
  try {
    const agentId = String(req.params.agentId || '').trim();
    if (!agentId) return res.status(400).json({ error: 'Validation Error', message: 'agentId는 필수입니다.' });

    // agent 하위 store 목록
    const stores = await Store.find({ $or: [{ agentId }, { agentid: agentId }] }).select('_id storeId userid').lean();
    const storeIds = (stores || []).map((s) => s._id).filter(Boolean);
    const storeIdStrings = (stores || [])
      .map((s) => String(s.storeId || s.userid || '').trim())
      .filter((x) => !!x);

    // cascade: menus/categories/devices/stores/user
    const menusResult = storeIds.length ? await Menu.deleteMany({ storeId: { $in: storeIds } }) : { deletedCount: 0 };
    const categoriesResult = storeIds.length ? await Category.deleteMany({ storeId: { $in: storeIds } }) : { deletedCount: 0 };

    const deviceQuery = {
      $or: [
        { agentId },
        ...(storeIds.length ? [{ storeRef: { $in: storeIds } }, { storeIdLegacy: { $in: storeIds } }] : []),
        ...(storeIdStrings.length ? [{ storeId: { $in: storeIdStrings } }] : []),
      ],
    };
    const devicesResult = await Device.deleteMany(deviceQuery);

    const storesResult = storeIds.length ? await Store.deleteMany({ _id: { $in: storeIds } }) : { deletedCount: 0 };
    const userResult = await User.deleteOne({ $or: [{ agentId }, { agentid: agentId }] });

    res.json({
      message: 'Agent deleted successfully (cascade)',
      deleted: {
        user: userResult?.deletedCount || 0,
        stores: storesResult?.deletedCount || 0,
        categories: categoriesResult?.deletedCount || 0,
        menus: menusResult?.deletedCount || 0,
        devices: devicesResult?.deletedCount || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

