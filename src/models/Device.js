const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  // 표준 필드명
  agentId: { type: String, index: true },
  storeId: { type: String, index: true }, // Store ID(문자열)
  deviceId: { type: String, required: true, index: true }, // Device ID(문자열)

  // 레거시 필드명(호환)
  eqid: { type: String, index: true },

  // 과거 필드: storeId(ObjectId)였음 → 표준에서는 storeRef로 의미 분리
  storeRef: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    index: true,
  },
  // 레거시 호환: 기존 문서의 storeId(ObjectId)도 유지(라우트 호환을 위해)
  storeIdLegacy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    index: true,
  },

  resources: [
    {
      type: { type: String, enum: ['image', 'video'], required: true },
      url: { type: String, required: true },
      filename: { type: String, required: true },
      size: { type: Number, default: 0 },
      order: { type: Number, default: 0 },
      enabled: { type: Boolean, default: true },
      displayTime: { type: Number, default: 5000 },
      fadeInOut: { type: Boolean, default: false },
      uploadedAt: { type: Date, default: Date.now },
    },
  ],

  useResourceFadeInOut: { type: Boolean, default: false },
  displayTime: { type: Number, default: 5000, min: 1000 },
  enabled: { type: Boolean, default: true },

  // ===== Device 카테고리(트리 분류용) =====
  // - 카테고리가 없으면 "기타"로 분류
  // - store 하위 트리에서 5개 그룹(로컬서버PC/DID/KDS/호출벨/기타)으로 묶기 위한 필드
  category: {
    type: String,
    enum: ['localserver', 'did', 'kds', 'callbell', 'etc'],
    default: 'etc',
    index: true,
  },

  // DID(Android) 구동 옵션 (Device ID 단위로 공유)
  didOptions: {
    loop: { type: Boolean, default: true },
    shuffle: { type: Boolean, default: false },
    fitMode: { type: String, enum: ['contain', 'cover'], default: 'contain' },
    mute: { type: Boolean, default: true },
    offlineCache: { type: Boolean, default: true },
    wifiOnlySync: { type: Boolean, default: false },
    maxCacheMb: { type: Number, default: 512, min: 64 },
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Device ID는 agentId 단위로 유니크해야 함
deviceSchema.index({ agentId: 1, deviceId: 1 }, { unique: true, sparse: true });

deviceSchema.pre('save', function (next) {
  // 호환: eqid <-> deviceId
  if (!this.deviceId && this.eqid) this.deviceId = this.eqid;
  if (!this.eqid && this.deviceId) this.eqid = this.deviceId;

  // 호환: storeId(ObjectId)였던 경우 storeRef/storeIdLegacy로 동기화
  if (!this.storeRef && this.storeIdLegacy) this.storeRef = this.storeIdLegacy;
  if (!this.storeIdLegacy && this.storeRef) this.storeIdLegacy = this.storeRef;

  this.updatedAt = Date.now();
  next();
});

// 기존 컬렉션(eqids)을 그대로 사용하기 위해 컬렉션명을 고정
module.exports = mongoose.model('Device', deviceSchema, 'eqids');

