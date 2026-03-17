const express = require('express');
const router = express.Router();
const Eqid = require('../models/Eqid'); // (호환) 실제 모델은 Device(eqids 컬렉션)
const Store = require('../models/Store');
const mongoose = require('mongoose');

function toObjectIdMaybe(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

// 특정 Store의 모든 EQID 조회 (더 구체적인 라우트를 먼저)
router.get('/store/:storeId', async (req, res) => {
  try {
    const storeRef = toObjectIdMaybe(req.params.storeId);
    const query = storeRef
      ? { $or: [{ storeRef }, { storeIdLegacy: storeRef }, { storeId: storeRef }] }
      : { $or: [{ storeId: req.params.storeId }, { storeIdLegacy: req.params.storeId }, { storeRef: req.params.storeId }] };

    const eqids = await Eqid.find(query)
      .sort({ createdAt: -1 });
    res.json(eqids);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 Store + 카테고리의 EQID 일괄 삭제 (트리 카테고리 노드 삭제용)
router.delete('/store/:storeId/category/:category', async (req, res) => {
  try {
    const storeRef = toObjectIdMaybe(req.params.storeId);
    if (!storeRef) {
      return res.status(400).json({ error: 'Validation Error', message: 'storeId(ObjectId)가 유효하지 않습니다.' });
    }
    const category = String(req.params.category || '').trim();
    const allowed = new Set(['localserver', 'did', 'kds', 'callbell', 'etc']);
    if (!allowed.has(category)) {
      return res.status(400).json({ error: 'Validation Error', message: 'category 값이 올바르지 않습니다.' });
    }

    // 레거시 문서(storeId: string)까지 함께 삭제하기 위해 store 문서에서 storeId/userid를 조회
    const store = await Store.findById(storeRef).select('storeId userid').lean();
    const storeIdStr = String(store?.storeId || store?.userid || '').trim();

    const result = await Eqid.deleteMany({
      $or: [
        { storeRef },
        { storeIdLegacy: storeRef },
        ...(storeIdStr ? [{ storeId: storeIdStr }] : []),
      ],
      category,
    });
    res.json({ message: 'EQIDs deleted successfully', deletedCount: result?.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 리소스 관련 라우트를 먼저 배치 (더 구체적)
// EQID에 리소스 추가
router.post('/:id/resources', async (req, res) => {
  try {
    const eqid = await Eqid.findById(req.params.id);
    if (!eqid) {
      return res.status(404).json({ error: 'EQID not found' });
    }
    
    // 기본값 설정
    const resourceData = {
      ...req.body,
      enabled: req.body.enabled !== undefined ? req.body.enabled : true,
      displayTime: req.body.displayTime || eqid.displayTime || 5000,
      fadeInOut: req.body.fadeInOut || false,
    };
    
    eqid.resources.push(resourceData);
    await eqid.save();
    
    const populatedEqid = await Eqid.findById(eqid._id)
      .populate('storeId', 'name agentid userid');
    
    res.json(populatedEqid);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// EQID의 리소스 업데이트
router.put('/:id/resources/:resourceIndex', async (req, res) => {
  try {
    const eqid = await Eqid.findById(req.params.id);
    if (!eqid) {
      return res.status(404).json({ error: 'EQID not found' });
    }
    
    const resourceIndex = parseInt(req.params.resourceIndex);
    if (resourceIndex < 0 || resourceIndex >= eqid.resources.length) {
      return res.status(400).json({ error: 'Invalid resource index' });
    }
    
    const { enabled, displayTime, fadeInOut } = req.body;
    
    if (enabled !== undefined) eqid.resources[resourceIndex].enabled = enabled;
    if (displayTime !== undefined) eqid.resources[resourceIndex].displayTime = displayTime;
    if (fadeInOut !== undefined) eqid.resources[resourceIndex].fadeInOut = fadeInOut;
    
    await eqid.save();
    
    const populatedEqid = await Eqid.findById(eqid._id)
      .populate('storeId', 'name agentid userid');
    
    res.json(populatedEqid);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// EQID의 리소스 삭제
router.delete('/:id/resources/:resourceIndex', async (req, res) => {
  try {
    const eqid = await Eqid.findById(req.params.id);
    if (!eqid) {
      return res.status(404).json({ error: 'EQID not found' });
    }
    
    const resourceIndex = parseInt(req.params.resourceIndex);
    
    // 인덱스가 유효한 범위 내에 있으면 삭제, 없으면 이미 삭제된 것으로 간주하고 성공 처리
    if (resourceIndex >= 0 && resourceIndex < eqid.resources.length) {
      eqid.resources.splice(resourceIndex, 1);
      await eqid.save();
    }
    // 인덱스가 범위를 벗어나면 이미 삭제된 것으로 간주하고 성공 응답
    
    const populatedEqid = await Eqid.findById(eqid._id)
      .populate('storeId', 'name agentid userid');
    
    res.json(populatedEqid);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// 특정 EQID 조회 (일반적인 라우트는 나중에)
router.get('/:eqid', async (req, res) => {
  try {
    const key = req.params.eqid;
    const eqid = await Eqid.findOne({ $or: [{ deviceId: key }, { eqid: key }] })
      .populate('storeRef', 'name agentId agentid storeId userid');
    if (!eqid) {
      return res.status(404).json({ error: 'EQID not found' });
    }
    res.json(eqid);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// EQID 생성
router.post('/', async (req, res, next) => {
  try {
    const { eqid, deviceId, storeId, storeRef: storeRefBody, displayTime, enabled } = req.body;
    
    const idToUse = deviceId || eqid;
    const storeRef = storeRefBody || storeId;
    if (!idToUse || !storeRef) {
      return res.status(400).json({ error: 'EQID와 Store ID는 필수입니다.' });
    }

    // Store 존재 확인
    const store = await Store.findById(storeRef);
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    // 중복 확인 (Device ID는 Agent ID 단위로 유니크)
    const agentId = store.agentId || store.agentid;
    const existingEqid = await Eqid.findOne({ agentId, deviceId: idToUse }).select('_id').lean();
    if (existingEqid) {
      return res.status(400).json({ error: '이미 존재하는 EQID입니다.' });
    }

    const newEqid = new Eqid({
      deviceId: idToUse,
      eqid: idToUse,
      agentId,
      storeId: store.storeId || store.userid,
      storeRef: store._id,
      storeIdLegacy: store._id,
      displayTime: displayTime || 5000,
      enabled: enabled !== undefined ? enabled : true,
      resources: []
    });

    await newEqid.save();
    
    const populatedEqid = await Eqid.findById(newEqid._id)
      .populate('storeRef', 'name agentId agentid storeId userid');
    
    res.status(201).json(populatedEqid);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: '이미 존재하는 EQID입니다.' });
    }
    next(error);
  }
});

// EQID 수정
router.put('/:id', async (req, res, next) => {
  try {
    const { displayTime, enabled, useResourceFadeInOut, didOptions, category } = req.body;
    
    const updateData = {};
    if (displayTime !== undefined) updateData.displayTime = displayTime;
    if (enabled !== undefined) updateData.enabled = enabled;
    if (useResourceFadeInOut !== undefined) updateData.useResourceFadeInOut = useResourceFadeInOut;
    if (didOptions !== undefined) updateData.didOptions = didOptions;
    if (category !== undefined) updateData.category = category;

    const eqid = await Eqid.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('storeRef', 'name agentId agentid storeId userid');
    
    if (!eqid) {
      return res.status(404).json({ error: 'EQID not found' });
    }
    res.json(eqid);
  } catch (error) {
    next(error);
  }
});

// EQID 삭제
router.delete('/:id', async (req, res) => {
  try {
    const eqid = await Eqid.findByIdAndDelete(req.params.id);
    if (!eqid) {
      return res.status(404).json({ error: 'EQID not found' });
    }
    res.json({ message: 'EQID deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

