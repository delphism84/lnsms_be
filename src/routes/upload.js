const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Server: TusServer, FileStore, EVENTS } = require('tus-node-server');

// 업로드 디렉토리 생성 (로컬: /lunar/lnsms/uploads, Docker: /app/uploads)
const uploadDir = process.env.UPLOAD_DIR || (process.env.NODE_ENV === 'production' ? '/app/uploads' : '/lunar/lnsms/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// TUS 임시 저장 디렉토리(부분 업로드)
const tusDir = path.join(uploadDir, '.tus');
const tusMetaDir = path.join(tusDir, 'meta');
if (!fs.existsSync(tusMetaDir)) {
  fs.mkdirSync(tusMetaDir, { recursive: true });
}

// multer 설정
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  // 확장자 기반 허용 목록
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = new Set(['.jpeg', '.jpg', '.png', '.gif', '.mp4', '.webm', '.mov', '.avi']);

  // MIME 기반 허용 목록
  const allowedImageMime = new Set(['image/jpeg', 'image/png', 'image/gif']);
  const allowedVideoMime = new Set([
    'video/mp4',
    'video/webm',
    'video/quicktime',   // .mov
    'video/x-msvideo',   // .avi
  ]);

  const mimeOk = allowedImageMime.has(file.mimetype) || allowedVideoMime.has(file.mimetype);
  const extOk = allowedExts.has(ext);

  if (mimeOk && extOk) return cb(null, true);
  cb(new Error('이미지(jpg/png/gif) 또는 영상(mp4/webm/mov/avi) 파일만 업로드 가능합니다.'));
};

const upload = multer({
  storage: storage,
  // 대용량 업로드(사실상 제한 해제). 실제 제한은 Nginx/프록시/디스크 용량이 결정합니다.
  fileFilter: fileFilter
});

// =========================
// TUS 업로드 (resumable)
// =========================
// path는 "URL 경로"를 의미합니다. 이 라우터는 /api/upload 에 마운트되므로 여기서는 /tus 로 설정합니다.
const tusServer = new TusServer({ path: '/tus' });
tusServer.datastore = new FileStore({ path: '/tus', directory: tusDir });

function decodeUploadMetadata(headerValue) {
  // tus Upload-Metadata: "key base64value,key2 base64value2"
  // ref: https://tus.io/protocols/resumable-upload.html#upload-metadata
  const out = {};
  if (!headerValue || typeof headerValue !== 'string') return out;
  const parts = headerValue.split(',').map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const [k, v] = p.split(' ');
    if (!k) continue;
    if (!v) { out[k] = ''; continue; }
    try {
      out[k] = Buffer.from(v, 'base64').toString('utf8');
    } catch {
      out[k] = '';
    }
  }
  return out;
}

function safeFilename(name) {
  const base = String(name || '').trim() || 'file';
  // 경로/제어문자 제거
  const cleaned = base.replace(/[\\\/\0\r\n\t]+/g, '_').slice(0, 180);
  return cleaned || 'file';
}

function computeFileTypeFromMime(mime) {
  if (typeof mime !== 'string') return 'video';
  return mime.startsWith('image/') ? 'image' : 'video';
}

function computeBaseUrl(req) {
  // 프록시 뒤에서도 https를 유지
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim();
  if (host) return `${proto}://${host}`;
  return process.env.BASE_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://lnsms.lunarsystem.co.kr' : 'http://localhost:3000');
}

// 업로드 생성 시 메타 저장
tusServer.on(EVENTS.EVENT_FILE_CREATED, (event) => {
  try {
    const file = event.file; // { id, upload_length, upload_metadata, ... }
    const rawMeta = decodeUploadMetadata(file.upload_metadata);
    const filename = safeFilename(rawMeta.filename || rawMeta.name || rawMeta.originalname);
    const mimetype = rawMeta.mimetype || rawMeta.filetype || rawMeta.type || '';
    const metaPath = path.join(tusMetaDir, `${file.id}.json`);
    fs.writeFileSync(metaPath, JSON.stringify({
      id: file.id,
      size: Number(file.upload_length) || null,
      filename,
      mimetype,
      fileType: computeFileTypeFromMime(mimetype),
      createdAt: new Date().toISOString(),
      status: 'created',
    }, null, 2));
  } catch {
    // ignore
  }
});

// 업로드 완료 시 파일 이동 + 결과 저장
tusServer.on(EVENTS.EVENT_UPLOAD_COMPLETE, (event) => {
  try {
    const file = event.file;
    const metaPath = path.join(tusMetaDir, `${file.id}.json`);
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}

    const baseName = safeFilename(meta.filename || 'file');
    const ext = path.extname(baseName);
    const stem = ext ? baseName.slice(0, -ext.length) : baseName;
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const finalFilename = `${stem}-${uniqueSuffix}${ext || ''}`;

    const src = path.join(tusDir, file.id);
    const dest = path.join(uploadDir, finalFilename);

    // tus-node-server FileStore 기본 파일명은 upload.id
    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
    }

    const updated = {
      ...meta,
      id: file.id,
      size: Number(file.upload_length) || meta.size || null,
      finalFilename,
      fileType: meta.fileType || computeFileTypeFromMime(meta.mimetype),
      completedAt: new Date().toISOString(),
      status: 'completed',
    };
    fs.writeFileSync(metaPath, JSON.stringify(updated, null, 2));
  } catch (e) {
    // ignore
  }
});

// tus 핸들러는 Router에서 직접 처리(Express)
router.all('/tus', (req, res) => tusServer.handle(req, res));
router.all('/tus/:id', (req, res) => tusServer.handle(req, res));

// 업로드 완료 결과 조회
router.get('/tus/:id/result', (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const metaPath = path.join(tusMetaDir, `${id}.json`);
    if (!fs.existsSync(metaPath)) {
      return res.status(404).json({ error: 'Not Found', message: '업로드 정보를 찾을 수 없습니다.' });
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (meta.status !== 'completed') {
      return res.status(409).json({ error: 'Not Ready', message: '업로드가 아직 완료되지 않았습니다.' });
    }
    const baseUrl = computeBaseUrl(req);
    const url = `${baseUrl}/uploads/${meta.finalFilename || meta.filename}`;
    res.json({
      type: meta.fileType || 'video',
      url,
      filename: meta.finalFilename || meta.filename,
      size: meta.size,
      originalName: meta.filename,
      mimetype: meta.mimetype,
      id: meta.id,
    });
  } catch (e) {
    res.status(500).json({ error: 'Server Error', message: e?.message || '서버 오류' });
  }
});

// 단일 파일 업로드
router.post('/single', upload.single('file'), (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }
    
    const fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
    // 프로덕션 환경에서는 HTTPS URL 사용, 개발 환경에서는 환경 변수 또는 기본값 사용
    const baseUrl = process.env.BASE_URL || 
      (process.env.NODE_ENV === 'production' 
        ? 'https://lnsms.lunarsystem.co.kr' 
        : 'http://localhost:3000');
    
    res.json({
      type: fileType,
      url: `${baseUrl}/uploads/${req.file.filename}`,
      filename: req.file.filename,
      size: req.file.size,
      originalName: req.file.originalname
    });
  } catch (error) {
    next(error);
  }
});

// 다중 파일 업로드
router.post('/multiple', upload.array('files', 10), (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }
    
    // 프로덕션 환경에서는 HTTPS URL 사용, 개발 환경에서는 환경 변수 또는 기본값 사용
    const baseUrl = process.env.BASE_URL || 
      (process.env.NODE_ENV === 'production' 
        ? 'https://lnsms.lunarsystem.co.kr' 
        : 'http://localhost:3000');
    
    const files = req.files.map(file => ({
      type: file.mimetype.startsWith('image/') ? 'image' : 'video',
      url: `${baseUrl}/uploads/${file.filename}`,
      filename: file.filename,
      size: file.size,
      originalName: file.originalname
    }));
    
    res.json({ files });
  } catch (error) {
    next(error);
  }
});

// 정적 파일 서빙을 위한 라우트
router.use('/uploads', express.static(uploadDir));

module.exports = router;

