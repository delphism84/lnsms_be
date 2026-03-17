const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  // 표준 필드명
  agentId: {
    type: String,
    trim: true,
    index: true,
    // 기존 데이터 마이그레이션 동안에는 일부 문서에 없을 수 있어 sparse 처리
    unique: true,
    sparse: true,
  },
  // 레거시 필드명(호환 유지)
  agentid: {
    type: String,
    required: [true, 'Agent ID는 필수입니다.'],
    unique: true,
    trim: true,
    index: true
  },
  // ===== 에이전트 상세 정보(확장) =====
  name: { type: String, default: '' },
  description: { type: String, default: '' },
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
    legalName: { type: String, default: '' },
    brandName: { type: String, default: '' },
    ceoName: { type: String, default: '' },
    bizNo: { type: String, default: '' },
    bizType: { type: String, default: '' },
    bizItem: { type: String, default: '' },
    openingDate: { type: String, default: '' },
  },
  operations: {
    timezone: { type: String, default: 'Asia/Seoul' },
    hoursText: { type: String, default: '' },
    breakTimeText: { type: String, default: '' },
    lastOrderText: { type: String, default: '' },
    holidayText: { type: String, default: '' },
  },
  services: {
    supportHoursText: { type: String, default: '' },
    supportChannelText: { type: String, default: '' },
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
    themeColor: { type: String, default: '' },
    notice: { type: String, default: '' },
  },
  integration: {
    memo: { type: String, default: '' },
  },
  status: {
    active: { type: Boolean, default: true },
    suspended: { type: Boolean, default: false },
    suspendReason: { type: String, default: '' },
  },
  tags: { type: [String], default: [] },
  memoInternal: { type: String, default: '' },
  // (표준) 비밀번호 해시 저장 필드
  // - 기존 pw는 호환 유지
  userpw: {
    type: String,
    required: false,
  },
  // (요청) 비밀번호 원본(평문) 저장 필드 - 추후 삭제 예정
  // !!! 보안상 매우 위험하므로 반드시 빠르게 제거/마스킹 권장
  userpworg: {
    type: String,
    required: false,
  },
  // (레거시) 비밀번호 해시 저장 필드 (호환 유지)
  pw: {
    type: String,
    required: false,
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

// agentid는 유니크 인덱스 (레거시 호환)
// agentId는 sparse unique 인덱스 (마이그레이션 후 표준 필드로 사용)

// NOTE:
// - 에이전트(aget/users)는 "프로필(상세정보)" 용도로도 쓰이므로 비밀번호 없이도 저장 가능하게 둡니다.
// - 회원가입/비밀번호 변경 API에서만 비밀번호 필수 검증을 수행합니다.

// 비밀번호 해싱 + (요청) userpworg 저장 + userpw/pw 동기화
userSchema.pre('save', async function (next) {
  const pwChanged = this.isModified('pw');
  const userpwChanged = this.isModified('userpw');
  if (!pwChanged && !userpwChanged) return next();

  try {
    // 입력 우선순위: userpw -> pw
    const candidate = (userpwChanged && this.userpw) ? this.userpw : this.pw;
    if (!candidate) return next();

    // userpworg는 "원본(평문)" 보관 요청에 따라 최신 입력값으로 덮어씀
    // (이미 해시 형태라면 userpworg 덮어쓰지 않음)
    const looksHashed = typeof candidate === 'string' && /^\$2[aby]\$\d{2}\$/.test(candidate);
    if (!looksHashed) this.userpworg = candidate;

    // 이미 해시라면 그대로 동기화만 수행
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

// updatedAt 업데이트
userSchema.pre('save', function(next) {
  // 호환: agentid <-> agentId 동기화
  if (!this.agentId && this.agentid) this.agentId = this.agentid;
  if (!this.agentid && this.agentId) this.agentid = this.agentId;
  this.updatedAt = Date.now();
  next();
});

// 비밀번호 비교 메서드
userSchema.methods.comparePassword = async function(candidatePassword) {
  const hashed = this.userpw || this.pw;
  if (!hashed) return false;
  return bcrypt.compare(candidatePassword, hashed);
};

module.exports = mongoose.model('User', userSchema);

