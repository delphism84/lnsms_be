# LNSMS Backend

주문/판매 관리 시스템 백엔드 API 서버

## 개요

- 도메인: lnsms.lunarsystem.co.kr
- agent.store.eqid 3단계 트리 관리
- 추가, 삭제, 편집 기능
- store별 카테고리, 메뉴 편집
- 메뉴별 이미지, 영상 복수 등록
- 서버에 리소스 관리

## 기술 스택

- Node.js
- Express
- MongoDB

## 설치 및 실행

```bash
npm install
npm run dev
```

## 환경 변수

`.env` 파일 생성 필요:

```
MONGODB_URI=mongodb://mongodb:27017/lnsms
PORT=3000
```

## Docker 실행

```bash
docker compose up -d
```

