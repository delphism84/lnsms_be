require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// mongodb 연결
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://mongodb:27017/lnsms';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  console.log('MongoDB 연결 성공');

  // =========================
  // 필드명 표준화 마이그레이션
  // - agentid/userid/eqid -> agentId/storeId/deviceId
  // - 기존 데이터/기존 라우트가 깨지지 않도록 동기화 필드를 채움
  // =========================
  try {
    const User = require('./models/User');
    const Store = require('./models/Store');
    const Device = require('./models/Device');

    // Users: agentId 채우기
    await User.collection.updateMany(
      { agentId: { $exists: false }, agentid: { $exists: true } },
      [{ $set: { agentId: '$agentid' } }]
    );

    // Users: 비밀번호 필드 표준화(userpw <- pw)
    // - 기존 문서에서 pw(해시)가 있는 경우 userpw에도 동일한 해시를 채움
    await User.collection.updateMany(
      { userpw: { $exists: false }, pw: { $exists: true } },
      [{ $set: { userpw: '$pw' } }]
    );

    // Stores: agentId/storeId 채우기
    await Store.collection.updateMany(
      { agentId: { $exists: false }, agentid: { $exists: true } },
      [{ $set: { agentId: '$agentid' } }]
    );
    await Store.collection.updateMany(
      { storeId: { $exists: false }, userid: { $exists: true } },
      [{ $set: { storeId: '$userid' } }]
    );

    // 레거시 DB에 남아있는 잘못된 유니크 인덱스 정리
    // - eqid 필드는 다수 Store에서 null일 수 있으므로 unique면 저장이 막힘
    try {
      const idx = await Store.collection.indexes();
      const eqidUnique = idx.find((i) => i.name === 'eqid_1' && i.unique);
      if (eqidUnique) {
        await Store.collection.dropIndex('eqid_1');
        console.log('✅ dropped legacy unique index: stores.eqid_1');
      }
    } catch (e) {
      // dropIndex 실패는 치명적이지 않음(권한/이미 삭제 등)
      console.warn('[migration] drop stores.eqid_1 skipped/failed:', e?.message || e);
    }

    // Devices(eqids 컬렉션): deviceId 채우기
    await Device.collection.updateMany(
      { deviceId: { $exists: false }, eqid: { $exists: true } },
      [{ $set: { deviceId: '$eqid' } }]
    );

    // Devices: storeRef/storeIdLegacy 동기화 (레거시 storeId(ObjectId) -> storeIdLegacy)
    await Device.collection.updateMany(
      { storeIdLegacy: { $exists: false }, storeId: { $type: 'objectId' } },
      [{ $set: { storeIdLegacy: '$storeId' } }]
    );
    await Device.collection.updateMany(
      { storeRef: { $exists: false }, storeIdLegacy: { $exists: true } },
      [{ $set: { storeRef: '$storeIdLegacy' } }]
    );

    // Devices: agentId/storeId(문자열) 채우기 (storeRef 기반)
    const devicesNeeding = await Device.find({
      storeRef: { $exists: true, $ne: null },
      $or: [{ agentId: { $exists: false } }, { storeId: { $exists: false } }],
    })
      .select('_id storeRef')
      .lean();

    if (devicesNeeding.length) {
      const storeIds = Array.from(new Set(devicesNeeding.map((d) => String(d.storeRef))));
      const stores = await Store.find({ _id: { $in: storeIds } })
        .select('_id agentId agentid storeId userid')
        .lean();
      const storeMap = new Map(stores.map((s) => [String(s._id), s]));

      const bulk = Device.collection.initializeUnorderedBulkOp();
      let cnt = 0;
      for (const d of devicesNeeding) {
        const s = storeMap.get(String(d.storeRef));
        if (!s) continue;
        const agentId = s.agentId || s.agentid;
        const storeId = s.storeId || s.userid;
        if (!agentId || !storeId) continue;
        bulk.find({ _id: d._id }).updateOne({ $set: { agentId, storeId } });
        cnt += 1;
      }
      if (cnt) await bulk.execute();
    }
  } catch (e) {
    console.warn('[migration] field standardization skipped/failed:', e?.message || e);
  }
  
  // 기본 admin 계정 생성
  const AdminUser = require('./models/AdminUser');
  
  // cube 계정 생성
  const cubeUser = await AdminUser.findOne({ username: 'cube' });
  if (!cubeUser) {
    const newCubeUser = new AdminUser({
      username: 'cube',
      password: 'Eldpdj!@34',
      role: 'superadmin'
    });
    await newCubeUser.save();
    console.log('✅ 기본 관리자 계정 생성: cube / Eldpdj!@34');
  }
  
  // admin 계정 생성
  const adminUser = await AdminUser.findOne({ username: 'admin' });
  if (!adminUser) {
    const newAdminUser = new AdminUser({
      username: 'admin',
      password: 'admin',
      role: 'superadmin'
    });
    await newAdminUser.save();
    console.log('✅ 기본 관리자 계정 생성: admin / admin');
  }
})
.catch((err) => {
  console.error('MongoDB 연결 실패:', err);
});

// 라우트
const storesRouter = require('./routes/stores');
const categoriesRouter = require('./routes/categories');
const menusRouter = require('./routes/menus');
const uploadRouter = require('./routes/upload');
const authRouter = require('./routes/auth');
const eqidsRouter = require('./routes/eqids');
const adminAuthRouter = require('./routes/adminAuth');
const didRouter = require('./routes/did');
const agentsRouter = require('./routes/agents');
const devicesRouter = require('./routes/devices');

app.use('/api/stores', storesRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/menus', menusRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/auth', authRouter);
app.use('/api/eqids', eqidsRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/admin/auth', adminAuthRouter);
app.use('/api/did', didRouter);
app.use('/api/agents', agentsRouter);

// 정적 파일 서빙 (업로드된 파일)
const uploadDir = process.env.UPLOAD_DIR || (process.env.NODE_ENV === 'production' ? '/app/uploads' : '/lunar/lnsms/uploads');
app.use('/uploads', express.static(uploadDir));

// 기본 라우트
app.get('/', (req, res) => {
  res.json({ message: 'LNSMS Backend API' });
});

// health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 에러 핸들러
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// 404 핸들러
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'The requested resource was not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
});

