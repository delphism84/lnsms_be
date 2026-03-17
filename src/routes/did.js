const express = require('express');
const router = express.Router();
const Device = require('../models/Device');

function toAbsoluteUrl(req, url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.get('host') || '').toString().split(',')[0].trim();
  if (!host) return url;
  if (url.startsWith('/')) return `${proto}://${host}${url}`;
  return `${proto}://${host}/${url}`;
}

// Android FE 오프라인 캐시용 동기화 Manifest
// - deviceId 기준
// - 동일 deviceId로 로그인한 여러 기기(예: 3대)에서 동일 설정/리소스를 받도록 설계
router.get('/sync/:deviceId', async (req, res) => {
  try {
    const key = String(req.params.deviceId || '').trim();
    const device = await Device.findOne({ $or: [{ deviceId: key }, { eqid: key }] }).populate(
      'storeRef',
      'name agentId agentid storeId userid updatedAt'
    );
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const store = device.storeRef && typeof device.storeRef === 'object' ? device.storeRef : null;
    const version = new Date(device.updatedAt || device.createdAt || Date.now()).toISOString();

    const resources = (device.resources || [])
      .map((r, idx) => ({
        id: `${device.deviceId || device.eqid}:${idx}`,
        type: r.type,
        url: r.url,
        downloadUrl: toAbsoluteUrl(req, r.url),
        filename: r.filename,
        size: r.size || 0,
        order: r.order ?? idx,
        enabled: r.enabled !== undefined ? r.enabled : true,
        displayTime: r.displayTime || device.displayTime || 5000,
        fadeInOut: !!r.fadeInOut,
        uploadedAt: r.uploadedAt ? new Date(r.uploadedAt).toISOString() : null,
      }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    res.json({
      agentId: device.agentId,
      storeId: device.storeId,
      deviceId: device.deviceId,
      version,
      store: store
        ? {
            id: store._id,
            name: store.name,
            agentId: store.agentId || store.agentid,
            storeId: store.storeId || store.userid,
            updatedAt: store.updatedAt ? new Date(store.updatedAt).toISOString() : null,
          }
        : null,
      didOptions: device.didOptions || {},
      defaults: {
        displayTime: device.displayTime || 5000,
        useResourceFadeInOut: !!device.useResourceFadeInOut,
      },
      resources,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

