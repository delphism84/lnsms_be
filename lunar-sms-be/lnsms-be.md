# lnsms-be 설계 (WS-only + MongoDB)

> 이 문서는 `lunar-sms-be/lnsms-be.md`와 동일한 내용입니다.  
> (루트에서 바로 찾기 쉽게 복사본을 둡니다)

## 1) 목표/범위

### 목표
- **모든 설정/관리 기능을 BE를 통해서만** 처리한다. (UI/에이전트는 BE에 연결만 함)
- 데이터 영속성은 **MongoDB**를 사용한다. (문서 구조는 **JSON** 기반)
- 외부 API는 **REST를 사용하지 않고 WebSocket(WS)만** 사용한다.
- 설정 변경 시 **실시간 푸시**(구독/브로드캐스트)를 제공한다.
- 전세계 플랫폼 대상: **업체(agentId) / 매장(userId) / 기기(eqId)** 계층으로 데이터/설정을 분리한다.
- 상위 설정을 하위(모든 매장/모든 기기)에 일괄 적용하는 **enabledRecursive** 옵션을 지원한다.
- PC Agent는 시리얼로 수신한 벨코드를 **기본적으로 서버에 re-send(ON)** 한다.
- 서버는 수신한 코드를 **설정에 따라 모든 매장-기기로 re-send** 할 수 있다.
- re-send로 받은 PC Agent는 **실제 시리얼 수신처럼** 동일 파이프라인으로 처리한다.
- re-send “대상 범위”는 **페이스북 노출 허용**처럼 allow-list로 관리한다:
  - **대상 agentId 선택**(기본: 자기 자신, 필요 시 다른 agentId도 허용)
  - **userId는 agentId 하위 목록 체크**(일부 선택 또는 전체)
  - **eqId는 userId 하위 목록 체크**(일부 선택 또는 전체)

### 비목표(초기)
- 외부 공개용 인증/권한(SSO/OAuth) 완성형 제공
- 멀티테넌트/클러스터(샤딩)까지의 확장 설계 구현

---

## 2) 용어
- **Admin UI**: 설정 화면(문구 관리/시스템 설정/시리얼/TTS/이력 등)
- **Agent/Host**: 로컬 장치 제어(시리얼 통신, TTS 재생 등)를 수행하는 실행체
- **agentId**: 업체(테넌트) 식별자
- **userId**: 매장(사이트) 식별자 (agentId 하위)
- **eqId**: 매장 내 기기 식별자 (userId 하위)
- **BellCode**: 장치에서 들어오는 호출 코드(예: `crcv.assist`)
- **Phrase**: BellCode에 매핑되는 알림 문구/색상/옵션
- **SystemSettings**: 앱 이름, 알림 타이틀, 기본 문구, 이미지 등의 전역 설정
- **Recursive(재귀 적용)**: 상위 스코프에서 설정을 켜면 하위 스코프(모든 매장/모든 기기)에 적용되는 동작
- **re-send(재송신)**: (PC Agent → 서버) 벨코드 업링크, (서버 → 대상) 벨코드 다운링크 브로드캐스트
- **resendAudience(재송신 대상 범위)**: bell 이벤트를 수신했을 때, 서버가 재송신할 대상(agent/user/eq)의 allow-list

---

## 3) 핵심 도메인 규칙(현재 운영 규칙 반영)

### 기본 문구(디폴트 Phrase)
- **기본 UID**: `90000001`
- **기본 벨코드**: `crcv.assist`
- 제약:
  - `crcv.assist`는 **기본 문구(UID=90000001)에만** 존재 가능
  - 기본 문구는 **삭제 불가**
  - 기본 문구는 항상 목록에서 **맨 앞**에 오도록 정렬/보정

### BellCode 정규화 규칙
- 저장 시 `trim + toLower` 후 **distinct**

### Phrase 옵션
- `autoAckEnabled`(기본 `false`)
- `autoAckSeconds`(기본 `10`, 범위: `1..3600`, 0/음수 입력 시 `10`으로 보정)
- `imagePath`(옵션) 또는 파일 참조 ID

### 멀티테넌트/스코프 규칙
- 모든 데이터는 기본적으로 `agentId`로 분리된다(업체 단위).
- 매장 단위 정책/설정은 `userId`를 포함한다.
- 기기 단위 정책/설정은 `eqId`까지 포함한다.
- “전역(플랫폼 공통)”이 필요하다면 별도 `agentId = "global"` 같은 예약 테넌트를 두거나, 컬렉션을 분리한다(권장: 분리 또는 예약값을 명시적으로 관리).

### enabledRecursive 규칙(상위→하위 적용)
- 각 설정 문서에는 `enabled` 외에 `enabledRecursive`를 둘 수 있다.
- `enabledRecursive=true`인 설정은 해당 스코프의 하위에 대해 “기본값/상속값”으로 작동한다.
- 충돌 시 우선순위(권장): **eqId(기기) > userId(매장) > agentId(업체) > global**

---

## 4) 스코프 모델(설정 조회 규칙)

### 스코프 키
- 업체 스코프: `{ agentId }`
- 매장 스코프: `{ agentId, userId }`
- 기기 스코프: `{ agentId, userId, eqId }`

### 설정 조회 알고리즘(예: system/serial/tts 공통)
1. (기기) `{ agentId, userId, eqId }`에 **enabled=true** 설정이 있으면 사용  
2. 없으면 (매장) `{ agentId, userId }`에서 **enabledRecursive=true** 또는 **enabled=true**를 찾음  
3. 없으면 (업체) `{ agentId }`에서 **enabledRecursive=true** 또는 **enabled=true**를 찾음  
4. 없으면 global 기본값

> 실제 구현에서는 “설정 타입별로 상속 허용 여부”를 다르게 둘 수 있다(예: serial은 기기 고유라 상속 제한 등).

---

## 5) 아키텍처 개요

### 구성(권장)
- **WS Gateway**: 클라이언트(Admin UI/Agent) 접속, 메시지 라우팅/권한/구독 처리
- **Domain Services**: settings/phrases/serial/tts/history/notification 비즈니스 로직
- **MongoDB**: 모든 설정/데이터 저장
- (선택) **로컬 디바이스 브릿지**: 시리얼/TTS 같은 “로컬 리소스”는 Host/Agent가 담당하고, BE는 WS로 제어/상태 수집

> 참고: “BE가 로컬 장치(COM 포트/TTS)를 직접 만질지”는 배포 형태에 따라 달라집니다.  
> - 단일 PC 로컬 앱이라면 BE가 직접 접근 가능  
> - 중앙 서버 구조라면 Host(로컬) ↔ BE(중앙) 브릿지 필요

---

### (중요) re-send 플로우(요구사항 반영)
- **PC Agent(로컬)**: 시리얼 수신 → (기본 ON) 서버로 `bell.ingest` 전송
- **서버**: 수신한 벨코드에 대해
  - 저장/이력 기록
  - bellCode→Phrase 매핑 조회
  - Phrase 설정에 따른 **재송신 대상 범위(resendAudience)** 로 `bell.resend` 푸시
- **PC Agent(로컬)**: `bell.resend` 수신 → 내부적으로 **시리얼 수신과 동일하게** 처리(= “가짜 RX”로 주입)

루프 방지(필수):
- 모든 bell 이벤트에 `eventId`(ULID/UUID) 부여, 서버/에이전트 모두 **최근 N개 처리 캐시**로 중복 드랍
- `originEqId`(최초 발생 기기) 포함, 서버는 기본적으로 `originEqId`로 **자기 자신에게 다시 보내지 않음**(옵션으로 허용 가능)
- `hop`(기본 0) 두고 `hop > 1` 같은 제한으로 무한 재송신 방지

권한(필수):
- 다른 `agentId`로 re-send를 허용하려면 서버에서 **명시적인 권한(ACL/Role/Policy)** 이 있어야 한다.
- 기본 정책은 “자기 `agentId`만 허용”, 권한 부여된 경우에만 교차 agentId 허용.

---

## 6) WebSocket 프로토콜(WS-only)

### 5.1 메시지 Envelope(공통)
모든 메시지는 다음 JSON envelope를 사용한다.

```json
{
  "v": 1,
  "id": "req-uuid-or-ulid",
  "type": "phrases.list",
  "ts": "2026-01-09T12:34:56.789Z",
  "meta": {
    "agentId": "vendor-001",
    "userId": "store-001",
    "eqId": "eq-001",
    "clientType": "admin-ui|pc-agent|server",
    "traceId": "optional"
  },
  "payload": {}
}
```

- `v`: 프로토콜 버전
- `id`: 요청/응답 매칭용(클라이언트가 생성 권장)
- `type`: 메시지 타입(커맨드/쿼리/이벤트)
- `ts`: ISO-8601 UTC
- `meta`: 멀티테넌트/라우팅 메타(요청자 스코프)
- `payload`: 타입별 데이터

### 5.2 응답 포맷(공통)

```json
{
  "v": 1,
  "id": "same-as-request-id",
  "type": "phrases.list.res",
  "ok": true,
  "payload": {}
}
```

에러:

```json
{
  "v": 1,
  "id": "same-as-request-id",
  "type": "phrases.update.res",
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "crcv.assist는 기본 문구에만 할당할 수 있습니다.",
    "details": {
      "field": "bellCodes",
      "value": "crcv.assist"
    }
  }
}
```

### 5.3 초기 핸드셰이크
- 클라이언트 → 서버: `hello`
- 서버 → 클라이언트: `hello.res`

`hello` 예시:

```json
{
  "v": 1,
  "id": "h-1",
  "type": "hello",
  "ts": "2026-01-09T12:00:00.000Z",
  "payload": {
    "clientType": "admin-ui",
    "clientVersion": "1.0.0",
    "instanceId": "pc-001",
    "auth": {
      "token": "optional"
    }
  }
}
```

`hello.res` 예시:

```json
{
  "v": 1,
  "id": "h-1",
  "type": "hello.res",
  "ok": true,
  "payload": {
    "serverVersion": "0.1.0",
    "capabilities": {
      "binaryUpload": true,
      "historyExport": true
    }
  }
}
```

### 5.4 구독(푸시)
- 클라이언트 → 서버: `subscribe`
- 서버 → 클라이언트: 이벤트(예: `systemSettings.changed`)

```json
{
  "v": 1,
  "id": "sub-1",
  "type": "subscribe",
  "payload": {
    "topics": ["systemSettings", "phrases", "serial", "notifications", "tts", "bell"],
    "scope": {
      "agentId": "vendor-001",
      "userId": "store-001",
      "eqId": "eq-001"
    }
  }
}
```

> 서버는 `scope`에 따라 이벤트 라우팅을 한다. (예: `bell.resend`는 대상 eqId에만)

---

## 7) WS 메시지 타입 정의(확장: 멀티테넌트/재송신 포함)

### 6.1 SystemSettings
- `systemSettings.get`
- `systemSettings.update`
- `systemSettings.notificationImage.upload.init / chunk / commit` (REST 금지 조건 대응)
- 이벤트: `systemSettings.changed`

`systemSettings.update` payload:

```json
{
  "appName": "알림관리시스템",
  "notificationTitle": "알림관리시스템",
  "notificationDefaultMessage": "알림이 도착했습니다",
  "notificationImageAltText": "알림"
}
```

### 6.2 Phrases(문구/벨코드)
- `phrases.list`
- `phrases.create`
- `phrases.update`
- `phrases.delete`
- `phrases.image.upload.init / chunk / commit`
- 이벤트: `phrases.changed`

제약(서버 검증):
- `uid=90000001` 생성 금지, 삭제 금지
- `crcv.assist`는 `uid=90000001`만 보유 가능
- `bellCodes`는 정규화 후 중복 제거
- `bellCodes`는 **전체 Phrase에서 유일**(중복 할당 불가)

추가: 재송신 대상 관리(요구사항 / 페이스북 allow-list 방식)
- 문구-벨코드 설정에 `resendAudience`를 포함한다.
- `resendAudience`는 **allow-list**이며, 각 차원(agent/user/eq)은 “일부 선택” 또는 “전체(*)”를 지원한다.

권장 모델:

```json
{
  "resendEnabled": true,
  "resendAudience": {
    "allow": [
      {
        "agentId": "vendor-001",
        "users": [
          { "userId": "*", "eqs": ["*"] }
        ]
      },
      {
        "agentId": "vendor-002",
        "users": [
          { "userId": "store-010", "eqs": ["*"] },
          { "userId": "store-011", "eqs": ["eq-001", "eq-002"] }
        ]
      }
    ]
  }
}
```

의미:
- `agentId`는 대상 업체 선택(기본은 “자기 agentId”만 넣으면 됨)
- `users[].userId="*"`는 해당 agentId의 **모든 매장**
- `users[].eqs=["*"]`는 해당 userId의 **모든 기기**
- 부분 선택은 `userId`, `eqId`를 리스트로 나열

### 6.3 Serial(포트/연결/로그)
> 배포 형태에 따라 “BE가 직접 COM을 열어 연결” 또는 “Host가 연결하고 BE는 제어만” 중 하나로 결정.

- `serial.ports.list` (가능한 포트 나열)
- `serial.status.get` (현재 연결상태/포트/baud)
- `serial.settings.get / update`
- `serial.connect / disconnect / reconnect`
- `serial.log.latest.get`
- `serial.log.enabled.set`
- 이벤트: `serial.status.changed`, `serial.rx`, `serial.tx`(선택), `serial.log.rotated`(선택)

`serial.settings` JSON:

```json
{
  "portName": "COM1",
  "baudRate": 9600,
  "autoConnect": true,
  "loggingEnabled": true
}
```

### 6.4 TTS
- `tts.enabled.get / set`
- `tts.speak` (text)
- 이벤트: `tts.enabled.changed`

### 6.5 Notifications(알림 처리/푸시)
- 이벤트: `notification.received`
- 이벤트(옵션): `notification.ack.scheduled`, `notification.ack.completed`

`notification.received` payload 예시:

```json
{
  "bellCode": "crcv.assist",
  "isRegistered": true,
  "phrase": {
    "uid": "90000001",
    "text": "도와주세요.",
    "color": "#FF0000",
    "autoAckEnabled": false,
    "autoAckSeconds": 10
  },
  "timestamp": "2026-01-09T12:34:56.000Z"
}
```

### 7.1 Bell ingest / resend (WS-only 핵심)

#### `bell.ingest` (PC Agent → 서버)
PC Agent가 **시리얼로 수신한 벨코드**를 서버로 전송(기본 ON).

payload:

```json
{
  "eventId": "ulid",
  "origin": "serial",
  "bellCode": "crcv.assist",
  "receivedAt": "2026-01-09T12:34:56.000Z",
  "originAgentId": "vendor-001",
  "originUserId": "store-001",
  "originEqId": "eq-001",
  "hop": 0
}
```

서버 처리:
- `bellCode` 정규화
- phrase 매핑/등록 여부 결정
- history 기록
- phrase의 `resendAudience.allow`에 따라 `bell.resend` 라우팅

#### `bell.resend` (서버 → PC Agent)
서버가 특정 대상(매장/기기)으로 bell 이벤트를 재송신.

payload:

```json
{
  "eventId": "same-ulid",
  "origin": "server-resend",
  "bellCode": "crcv.assist",
  "sentAt": "2026-01-09T12:34:57.000Z",
  "originAgentId": "vendor-001",
  "originUserId": "store-001",
  "originEqId": "eq-001",
  "hop": 1
}
```

PC Agent 처리 규칙:
- `eventId` 중복이면 무시
- 수신한 `bellCode`를 **로컬 시리얼 RX와 동일한 함수/파이프라인**으로 주입(= 시뮬레이션 RX)
- (중요) re-send로 받은 이벤트를 다시 `bell.ingest`로 올리면 루프가 생기므로,
  - `origin`이 `server-resend`인 이벤트는 업링크 re-send 비활성(권장)
  - 또는 `hop>=1`이면 업링크 금지

### 6.6 History(이력)
- `history.export.request` (기간)
- `history.export.result` (파일 메타데이터 또는 base64/다운로드 토큰)

> REST 금지이므로 파일 전달은 2가지 중 선택:
> - (권장) WS로 `file.download` 프로토콜 제공(청크 전송)
> - (대안) 서버 로컬 경로만 반환(단일 PC 로컬앱에 한정)

---

## 8) MongoDB 설계(JSON 문서 구조) - 멀티테넌트/스코프 반영

### 공통 필드
- `updatedAt`: ISODate
- `createdAt`: ISODate(엔티티 성격에 따라)
- `version`: number(낙관적 락/변경 감지용)
- `instanceId`: 설치 단위로 분리 저장이 필요하면 포함(옵션)

### 8.1 `system_settings` (스코프별 단일 문서)
컬렉션: `system_settings`

권장 키:
- 업체 스코프: `_id = "system:{agentId}"`
- 매장 스코프: `_id = "system:{agentId}:{userId}"`
- 기기 스코프: `_id = "system:{agentId}:{userId}:{eqId}"`

```json
{
  "_id": "system:vendor-001:store-001:eq-001",
  "agentId": "vendor-001",
  "userId": "store-001",
  "eqId": "eq-001",
  "enabled": true,
  "enabledRecursive": false,
  "appName": "알림관리시스템",
  "notificationTitle": "알림관리시스템",
  "notificationDefaultMessage": "알림이 도착했습니다",
  "notificationImageAltText": "알림",
  "notificationImage": {
    "fileId": "files:system:notification-left.png",
    "contentType": "image/png",
    "sha256": "optional",
    "updatedAt": "2026-01-09T00:00:00.000Z"
  },
  "version": 3,
  "updatedAt": "2026-01-09T00:00:00.000Z"
}
```

인덱스:
- `{ _id: 1 }` (기본)
- `{ agentId: 1, userId: 1, eqId: 1 }`
- `{ agentId: 1, userId: 1 }`
- `{ agentId: 1 }`

### 8.2 `phrases` (agentId 단위 분리)

```json
{
  "_id": "ObjectId",
  "agentId": "vendor-001",
  "uid": "90000001",
  "text": "도와주세요.",
  "isEnabled": true,
  "color": "#FF0000",
  "bellCodes": ["crcv.assist"],
  "resendEnabled": true,
  "resendAudience": {
    "allow": [
      {
        "agentId": "vendor-001",
        "users": [
          { "userId": "*", "eqs": ["*"] }
        ]
      },
      {
        "agentId": "vendor-002",
        "users": [
          { "userId": "store-010", "eqs": ["*"] },
          { "userId": "store-011", "eqs": ["eq-001", "eq-002"] }
        ]
      }
    ]
  },
  "image": {
    "fileId": "files:phrases:90000001.png",
    "contentType": "image/png",
    "updatedAt": "2026-01-09T00:00:00.000Z"
  },
  "autoAckEnabled": false,
  "autoAckSeconds": 10,
  "createdAt": "2026-01-09T00:00:00.000Z",
  "updatedAt": "2026-01-09T00:00:00.000Z",
  "version": 1
}
```

인덱스(권장):
- **unique** `{ agentId: 1, uid: 1 }`
- **unique** `{ agentId: 1, bellCodes: 1 }`

### 8.3 `serial_settings` (스코프별)
컬렉션: `serial_settings`
키 예시: `serial:{agentId}:{userId}:{eqId}`

```json
{
  "_id": "serial:vendor-001:store-001:eq-001",
  "agentId": "vendor-001",
  "userId": "store-001",
  "eqId": "eq-001",
  "enabled": true,
  "enabledRecursive": false,
  "portName": "COM1",
  "baudRate": 9600,
  "autoConnect": true,
  "loggingEnabled": true,
  "version": 5,
  "updatedAt": "2026-01-09T00:00:00.000Z"
}
```

### 8.4 `tts_settings` (스코프별)
컬렉션: `tts_settings`
키 예시: `tts:{agentId}:{userId}:{eqId}`

```json
{
  "_id": "tts:vendor-001:store-001:eq-001",
  "agentId": "vendor-001",
  "userId": "store-001",
  "eqId": "eq-001",
  "enabledRecursive": true,
  "enabled": true,
  "voice": {
    "culture": "ko-KR",
    "gender": "female",
    "name": "optional"
  },
  "version": 2,
  "updatedAt": "2026-01-09T00:00:00.000Z"
}
```

### 8.5 `history_records` (이력; 멀티테넌트)

```json
{
  "_id": "ObjectId",
  "agentId": "vendor-001",
  "userId": "store-001",
  "eqId": "eq-001",
  "timestamp": "2026-01-09T12:34:56.000Z",
  "bellCode": "crcv.assist",
  "phraseUid": "90000001",
  "phraseText": "도와주세요.",
  "isRegistered": true,
  "origin": "serial|server-resend",
  "eventId": "ulid"
}
```

인덱스(권장):
- `{ agentId: 1, timestamp: -1 }`
- `{ agentId: 1, userId: 1, timestamp: -1 }`
- `{ agentId: 1, userId: 1, eqId: 1, timestamp: -1 }`
- `{ agentId: 1, bellCode: 1, timestamp: -1 }`
- (옵션) `{ agentId: 1, eventId: 1 }` unique (중복 처리 방지)

---

## 9) 파일(이미지) 업로드/다운로드(REST 없이)

### 선택지 A(권장): WS 청크 업로드
- `file.upload.init` → 서버가 `uploadId` 발급
- `file.upload.chunk` 반복
- `file.upload.commit` → `fileId` 확정

### 선택지 B: base64 단건 업로드(간단하지만 비효율)
- 작은 png/jpg에 한해 `payload.dataBase64`로 전달

---

## 10) 동시성/정합성

### 낙관적 락(version)
- update 요청 시 `expectedVersion`을 포함하고, 불일치하면 `CONFLICT` 반환

### 이벤트 푸시
- 저장 성공 시 `*.changed` 이벤트 발행(새 `version` 포함)

---

## 11) 환경설정(예시)
- `MONGODB_URI`
- `MONGODB_DB`
- `WS_PORT`
- `INSTANCE_ID`

---

## 12) 결정 필요 사항(확인 부탁)
1. **BE 실행 위치**: 로컬 단일 PC vs 중앙 서버 + 로컬 브릿지
2. **이미지/CSV 전달 방식**: WS 청크 전송 vs 로컬 경로 반환
3. **인증**: 무인증 vs 단일 토큰/핀 vs 계정/권한(추후)
4. **교차 agentId re-send 정책**: 기본(자기 agentId만) + 권한(ACL/Role/Policy)로 특정 agentId만 교차 허용

