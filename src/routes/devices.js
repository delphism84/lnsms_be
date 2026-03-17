const express = require('express');
const router = express.Router();
const Device = require('../models/Device');
const Store = require('../models/Store');
const mongoose = require('mongoose');

function toObjectIdMaybe(id) {
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}

// 특정 Store(문서ID)의 Device 목록
router.get('/store/:storeRef', async (req, res) => {
  try {
    const storeRef = toObjectIdMaybe(req.params.storeRef);
    if (!storeRef) return res.status(400).json({ error: 'Invalid storeRef' });
    const devices = await Device.find({ $or: [{ storeRef }, { storeIdLegacy: storeRef }] }).sort({ createdAt: -1 });
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 Agent ID의 Device 목록 (DID 로그인 후 선택 모달용)
router.get('/agent/:agentId', async (req, res) => {
  try {
    const agentId = String(req.params.agentId || '').trim();
    if (!agentId) return res.status(400).json({ error: 'agentId is required' });
    const devices = await Device.find({ $or: [{ agentId }, { agentid: agentId }] })
      .populate('storeRef', 'name agentId agentid storeId userid')
      .sort({ deviceId: 1, createdAt: -1 });

    // 표준 응답 형태로 normalize
    res.json(
      devices.map((d) => ({
        id: d._id,
        agentId: d.agentId,
        storeId: d.storeId,
        deviceId: d.deviceId,
        enabled: d.enabled,
        resourceCount: (d.resources || []).length,
        store: d.storeRef
          ? {
              id: d.storeRef._id,
              name: d.storeRef.name,
              agentId: d.storeRef.agentId || d.storeRef.agentid,
              storeId: d.storeRef.storeId || d.storeRef.userid,
            }
          : null,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 특정 Device 조회 (deviceId 기준)
router.get('/:deviceId', async (req, res) => {
  try {
    const key = String(req.params.deviceId || '').trim();
    const device = await Device.findOne({ $or: [{ deviceId: key }, { eqid: key }] }).populate(
      'storeRef',
      'name agentId agentid storeId userid'
    );
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json(device);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Device 생성
router.post('/', async (req, res, next) => {
  try {
    const { deviceId, storeRef, storeId, agentId, displayTime, enabled } = req.body;
    const idToUse = String(deviceId || '').trim();
    const storeRefId = storeRef || storeId; // 호환
    if (!idToUse || !storeRefId) {
      return res.status(400).json({ error: 'deviceId와 storeRef는 필수입니다.' });
    }

    const store = await Store.findById(storeRefId);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const aId = String(agentId || store.agentId || store.agentid || '').trim();
    const sId = String(store.storeId || store.userid || '').trim();
    if (!aId || !sId) return res.status(400).json({ error: 'Store의 agentId/storeId가 유효하지 않습니다.' });

    const exists = await Device.findOne({ agentId: aId, deviceId: idToUse }).select('_id').lean();
    if (exists) return res.status(400).json({ error: '이미 존재하는 Device ID입니다.' });

    const doc = new Device({
      agentId: aId,
      storeId: sId,
      deviceId: idToUse,
      eqid: idToUse, // 레거시 동기화
      storeRef: store._id,
      storeIdLegacy: store._id,
      displayTime: displayTime || 5000,
      enabled: enabled !== undefined ? enabled : true,
      resources: [],
    });
    await doc.save();
    res.status(201).json(await Device.findById(doc._id).populate('storeRef', 'name agentId agentid storeId userid'));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: '이미 존재하는 Device ID입니다.' });
    }
    next(error);
  }
});

module.exports = router;

