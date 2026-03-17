const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const storeSchema = new mongoose.Schema({
  // 표준 필드명
  agentId: { type: String, index: true },
  storeId: { type: String, index: true },

  // 레거시 필드명(호환)
  agentid: { type: String, required: true, index: true },
  userid: { type: String, required: true, index: true },
  // 과거: Store에 1개의 eqid를 붙여 DID에서 사용하던 필드(호환 유지)
  eqid: { type: String, index: true },

  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  // ===== 점포 상세 정보 =====
  manager: {
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
  },
  contact: {
    phoneMain: { type: String, default: '' },
    phoneAlt: { type: String, default: '' },
    fax: { type: String, default: '' },
    emailMain: { type: String, default: '' },
    emailAlt: { type: String, default: '' },
    website: { type: String, default: '' },
    kakaoChannel: { type: String, default: '' },
    instagram: { type: String, default: '' },
    facebook: { type: String, default: '' },
    naverPlace: { type: String, default: '' },
    naverBlog: { type: String, default: '' },
    youtube: { type: String, default: '' },
  },
  location: {
    address1: { type: String, default: '' },
    address2: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    city: { type: String, default: '' },
    region: { type: String, default: '' },
    country: { type: String, default: 'KR' },
    floor: { type: String, default: '' },
    unit: { type: String, default: '' },
    directions: { type: String, default: '' },
    parkingInfo: { type: String, default: '' },
    mapUrl: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },
  business: {
    legalName: { type: String, default: '' },       // 상호(법인/사업자)
    brandName: { type: String, default: '' },       // 브랜드/간판명
    ceoName: { type: String, default: '' },         // 대표자명
    bizNo: { type: String, default: '' },           // 사업자등록번호
    bizType: { type: String, default: '' },         // 업태
    bizItem: { type: String, default: '' },         // 종목
    openingDate: { type: String, default: '' },     // YYYY-MM-DD 문자열(간단 저장)
  },
  operations: {
    timezone: { type: String, default: 'Asia/Seoul' },
    hoursText: { type: String, default: '' },       // 영업시간(자유 서술)
    breakTimeText: { type: String, default: '' },   // 브레이크타임(자유 서술)
    lastOrderText: { type: String, default: '' },   // 라스트오더(자유 서술)
    holidayText: { type: String, default: '' },     // 휴무(자유 서술)
  },
  services: {
    dineIn: { type: Boolean, default: true },
    takeout: { type: Boolean, default: true },
    delivery: { type: Boolean, default: false },
    reservation: { type: Boolean, default: false },
    catering: { type: Boolean, default: false },
    driveThru: { type: Boolean, default: false },
    kidsFriendly: { type: Boolean, default: false },
    petFriendly: { type: Boolean, default: false },
    wheelchairAccessible: { type: Boolean, default: false },
  },
  facilities: {
    parking: { type: Boolean, default: false },
    wifi: { type: Boolean, default: false },
    restroom: { type: Boolean, default: true },
    smokingArea: { type: Boolean, default: false },
    babyChair: { type: Boolean, default: false },
    powerOutlet: { type: Boolean, default: false },
    seatsCount: { type: Number, default: null },
  },
  billing: {
    taxEmail: { type: String, default: '' },
    invoiceName: { type: String, default: '' },
    invoicePhone: { type: String, default: '' },
    invoiceAddress1: { type: String, default: '' },
    invoiceAddress2: { type: String, default: '' },
    bankName: { type: String, default: '' },
    bankAccount: { type: String, default: '' },
    bankHolder: { type: String, default: '' },
    vatIncluded: { type: Boolean, default: true },
    serviceChargePct: { type: Number, default: 0 },
    currency: { type: String, default: 'KRW' },
  },
  branding: {
    logoUrl: { type: String, default: '' },
    coverImageUrl: { type: String, default: '' },
    interiorImageUrls: { type: [String], default: [] },
    themeColor: { type: String, default: '' },      // 예: #111827
    notice: { type: String, default: '' },          // 매장 공지(고객 노출 가능)
  },
  integration: {
    posVendor: { type: String, default: '' },
    posVersion: { type: String, default: '' },
    terminalCount: { type: Number, default: null },
    networkType: { type: String, default: '' },
    localServerIp: { type: String, default: '' },
    memo: { type: String, default: '' },
  },
  status: {
    active: { type: Boolean, default: true },
    suspended: { type: Boolean, default: false },
    suspendReason: { type: String, default: '' },
  },
  tags: { type: [String], default: [] },
  memoInternal: { type: String, default: '' },      // 관리자 전용 메모
  // ===== Store 계정(매장ID userid) 비밀번호 =====
  // (표준) 비밀번호 해시 저장 필드
  userpw: { type: String, required: false },
  // (요청) 비밀번호 원본(평문) 저장 필드 - 보안상 매우 위험 (가능하면 제거 권장)
  userpworg: { type: String, required: false },
  // (레거시) 비밀번호 해시 저장 필드 (호환)
  pw: { type: String, required: false },
  // slideConfig(간격/전환효과)는 스토어 설정에서 제거 예정 (레거시 호환은 유지하되, UI에서는 사용하지 않음)
  slideConfig: {
    interval: { type: Number, default: 5000 },
    transition: { type: String, default: 'fade' }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 유니크 인덱스
// - 표준: agentId + storeId
// - 레거시: agentid + userid
storeSchema.index({ agentId: 1, storeId: 1 }, { unique: true, sparse: true });
storeSchema.index({ agentid: 1, userid: 1 }, { unique: true });

storeSchema.pre('save', function(next) {
  // 호환: agentid/userid <-> agentId/storeId 동기화
  if (!this.agentId && this.agentid) this.agentId = this.agentid;
  if (!this.agentid && this.agentId) this.agentid = this.agentId;

  if (!this.storeId && this.userid) this.storeId = this.userid;
  if (!this.userid && this.storeId) this.userid = this.storeId;

  this.updatedAt = Date.now();
  next();
});

// 비밀번호 해싱 + userpworg 저장 + userpw/pw 동기화
storeSchema.pre('save', async function (next) {
  const pwChanged = this.isModified('pw');
  const userpwChanged = this.isModified('userpw');
  if (!pwChanged && !userpwChanged) return next();

  try {
    const candidate = (userpwChanged && this.userpw) ? this.userpw : this.pw;
    if (!candidate) return next();

    const looksHashed = typeof candidate === 'string' && /^\$2[aby]\$\d{2}\$/.test(candidate);
    if (!looksHashed) this.userpworg = candidate;

    if (looksHashed) {
      this.pw = candidate;
      this.userpw = candidate;
      return next();
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(candidate, salt);

    this.pw = hashed;
    this.userpw = hashed;
    next();
  } catch (error) {
    next(error);
  }
});

// 비밀번호 비교 메서드
storeSchema.methods.comparePassword = async function(candidatePassword) {
  const hashed = this.userpw || this.pw;
  if (!hashed) return false;
  return bcrypt.compare(candidatePassword, hashed);
};

module.exports = mongoose.model('Store', storeSchema);

