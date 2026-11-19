# 깨비뚝딱 React — 로컬 Generative UI v2 연동

기존 깨비 캐릭터·채팅 시작·위젯 카드 흐름에서 Spring v2의 비동기 화면 구성 작업을 호출합니다.

후속 화면 수정은 **변경 내용 확인 → 미리보기 → 적용 또는 기존 화면 유지** 순서로 진행합니다. 확인 전에는 기존 화면을 보존하고, 취소해도 작성하던 입력값이 남습니다. 중복 확인·동시 수정·만료는 서버가 검사합니다. [백엔드 설계와 검증](https://github.com/sunwoo030616/KKBB-ddook-ddak-back-dev/blob/main/docs/화면_변경_미리보기.md).

```bash
npm ci
cp .env.example .env.local
npm run dev
```

백엔드의 Python AI 서비스는 8767, Spring은 8088에서 먼저 실행합니다. Vite가 `/api`를 Spring으로 프록시하며 접속 주소는 http://localhost:5173 입니다. 공개 배포 사이트는 변경하지 않았습니다.

검증: `npm test`, `npm run lint`, `npm run build`.

2026-11-04: 근거가 필요한 화면은 공식 문서의 절·원문 링크·기준일·자료 부족 상태를 표시합니다. `evidence_mode=once`가 기본이며, 재검색은 백엔드의 `adaptive` 실험 옵션입니다. 개발 평가에서 재검색의 추가 회수 이득이 확인되지 않아 기본값으로 켜지 않았습니다.

기존 배포 환경이 `VITE_CHAT_API_URL=.../api/canvas`를 사용하면 v1의 `{message}` 요청을 유지합니다. 로컬 v2 주소는 비동기 `/jobs` 경로를 사용합니다.

- `src/lib/canvasClient.js`: 작업 제출·진행 조회·안정적인 요청 ID·revision 계약.
- `src/pages/ChatPage.jsx`: 기존 채팅과 생성 위젯, ID별 입력 보존.
- `src/components/widgets/ComposedWidget.jsx`: 계산 폼·결과·출처·맥락·참고 환율 표시.

브라우저에는 API 키를 넣지 않습니다. 생성은 로컬 모델을 사용하고 실제 계좌 거래는 수행하지 않습니다.

## 선택한 대출 조건 적용과 월 상환 예산

비교 카드에서 ‘이 조건으로 적용 미리보기’를 누르면 현재 계산과 선택한 조건의 월 납입액·총이자 차이를 확인합니다. 확인 후 적용하면 대출 폼과 상환표가 함께 바뀌고, 취소하면 작성 중인 입력을 유지합니다. 기존 화면 이력으로 돌아갈 수 있습니다.

월 예산을 저장하면 **마지막 회차 정산을 포함한 전체 상환표**에서 초과 회차 수·첫 초과·최대 초과액 또는 여유를 표시합니다. 원금이 다른 조건은 기존처럼 직접 순위를 비교하지 않습니다. 예산 저장과 적용 응답 유실도 새로고침 후 같은 요청으로 이어받습니다.

[설계·입력 계약·검증 범위](https://github.com/sunwoo030616/KKBB-ddook-ddak-back-dev/blob/main/docs/대출조건_선택적용과_월예산.md) · [브라우저 결과](reports/loan-selection-budget/browser.json) · [적용 전후 비교 화면](reports/loan-selection-budget/mobile-apply-review.png) · [월 예산 비교 화면](reports/loan-selection-budget/mobile-budget-comparison.png)

검증: 클라이언트 검사 **30개**, 전체 ESLint와 production build 통과. 새 백엔드 fixture와 기존 Vite 검증 프록시를 실행한 뒤 `node scripts/verify-loan-selection-budget.mjs`로 재현합니다. 예산 변경 충돌, 적용·취소·이력 복구, 저장·적용 응답 유실 후 새로고침을 포함하며 초기 화면 계획 모델만 고정한 기능 검사입니다.

## 새로고침과 작업 이어받기

화면·최근 대화·미전송 채팅·폼 입력·미확정 변경안·진행 작업을 해당 탭의 `sessionStorage`에 임시 저장합니다. 새로고침하면 서버 상태를 확인하고 이어받습니다. 접수 응답을 받지 못했어도 원래 요청 ID로 작업을 조회하며 자동으로 생성을 다시 제출하지 않습니다. 연결 오류는 ‘작업 다시 연결’로 재시도하고, 화면이 만료됐다면 새 대화를 시작합니다.

임시 기록은 마지막 갱신 후 30분간 유효하며 대화와 금융 입력을 포함합니다. 영구 저장소인 `localStorage`는 사용하지 않습니다. 저장소가 차단된 환경에는 복구 제한을 표시합니다.

## 대출 조건 비교

대출 상환 입력 폼에서 조건 이름과 함께 ‘이 조건을 비교에 저장’을 누릅니다. 최대 4개의 월 납입액·총이자·총 납입액과 첫 조건 대비 차이를 확인합니다. 원금이 다른 조건의 순위는 숨기며 고정금리·원리금균등 월납 등 계산 가정을 표시합니다. 비교 조건 저장·삭제도 새로고침 후 같은 요청으로 이어받습니다.

[설계·API·검증 범위](https://github.com/sunwoo030616/KKBB-ddook-ddak-back-dev/blob/main/docs/작업_이어받기와_대출조건_비교.md) · [작업 복구 브라우저 결과](reports/workspace-recovery/browser.json) · [대출 비교 결과](reports/loan-comparison/browser.json) · [비교 화면](reports/loan-comparison/mobile-comparison.png)

클라이언트 검사 **30개**, 전체 ESLint와 production build를 통과했습니다. 두 브라우저 검사는 각각 새 fixture 프로세스에서 실행합니다. Chrome·Playwright가 필요하며 외부 설치 모듈은 `PLAYWRIGHT_MODULE` 경로로 지정할 수 있습니다.

```bash
# 백엔드 저장소: 생성 도중 새로고침을 재현하는 지연 포함 fixture
REVIEW_FIXTURE_DELAY=2 python -m scripts.screen_review_fixture
# 이 프론트 저장소, 별도 터미널
VITE_DEV_COMPOSER_URL=http://127.0.0.1:8877 npm run dev
node scripts/verify-workspace-recovery.mjs
# 백엔드 fixture를 종료 후 새로 실행하고 비교 검증
node scripts/verify-loan-comparison.mjs
```

브라우저 검사는 실제 API·SQLite·Decimal 계산기를 사용하며 초기 화면 계획 모델만 고정합니다. 모델 정확도나 운영 성능을 측정한 결과는 아닙니다. 기본 실행은 기존 Spring 프록시를 사용합니다.

## 저장된 화면 복구

`저장된 화면 보기`에서 이전 화면의 기능·입력 조건·계산 결과를 미리 확인하고 복구합니다. 복구는 새 화면으로 저장하므로 이전 기록이 남고, 취소하면 현재 입력을 유지합니다. 복구 적용 시에는 현재의 미적용 입력을 초기화한다고 안내합니다. 마지막 저장 후 30분 동안 최근 최대 10개를 보관하며 서버 전체 한도로 더 일찍 제거될 수 있습니다. 금융 자료·기능 버전이 달라진 화면은 복구할 수 없습니다.

[복구 설계·한계](https://github.com/sunwoo030616/KKBB-ddook-ddak-back-dev/blob/main/docs/화면_이력과_복구.md) · [브라우저 검증 결과](reports/screen-history/browser.json) · [저장된 화면 UI](reports/screen-history/mobile-history.png)

클라이언트 검사 30개, ESLint와 production build를 통과했습니다. 새 백엔드 fixture와 위의 Vite 검증 프록시를 실행한 상태에서 `node scripts/verify-screen-history.mjs`로 계산 저장·이력·복구·취소·이어서 수정하기를 재현할 수 있습니다. 모델만 고정한 기능 검사이며 실제 모델 정확도 시험이 아닙니다.

## 화면 변경 브라우저 검사

`npm test` 13개, `npm run lint`, `npm run build`를 통과했습니다. [브라우저 검사 결과](reports/screen-review/browser.json)와 [모바일 변경 확인 화면](reports/screen-review/mobile-review.png)을 함께 저장했습니다.

브라우저 시험은 고정 모델 응답과 실제 Python 컴파일러·SQLite·API를 연결합니다. 실제 모델의 정확도를 재는 시험이 아닙니다. 새 fixture 프로세스에서 실행합니다.

```bash
# 백엔드 저장소의 별도 터미널
python -m scripts.screen_review_fixture
# 이 프론트 저장소의 별도 터미널 (기본 Spring 프록시 대신 검증용 Python API 사용)
VITE_DEV_COMPOSER_URL=http://127.0.0.1:8877 npm run dev
# Chrome과 Playwright 설치 환경
node scripts/verify-screen-review.mjs
# 로컬 외부 설치 모듈을 사용할 경우 PLAYWRIGHT_MODULE에 모듈 경로 지정 가능
```

기본 실행은 기존 Spring 프록시를 사용합니다. 공개 v1 사이트의 배포와는 별개입니다.

<div align="center">

# 깨비뚝딱 ✨

### 말하면, 필요한 금융 화면이 바로 만들어집니다.

사용자의 자연어를 이해하고 필요한 금융 기능을 실시간으로 조합하는<br />
**동적 생성형 금융 UI 서비스**

[![2026 KB AI Challenge](https://img.shields.io/badge/2026_KB_AI_Challenge-FFCC00?style=for-the-badge&logoColor=black)](https://www.figma.com/design/hW2FEx2HREkWZSIQR4qJqf/2026-KB-AI-Challenge)
[![Grand Prize](https://img.shields.io/badge/GRAND_PRIZE-금융감독원상-FFCC00?style=for-the-badge&labelColor=2D2D2D)](https://www.hankyung.com/article/202609032008P)
[![Live Demo](https://img.shields.io/badge/LIVE_DEMO-222222?style=for-the-badge&logo=netlify&logoColor=00C7B7)](https://kkbb-ddookddak.netlify.app)

<br />

<img src="./docs/images/home.png" width="280" alt="깨비뚝딱 홈 화면" />

<br />

**[깨비뚝딱 바로 체험하기 →](https://kkbb-ddookddak.netlify.app)**

</div>

---

## 🏆 제8회 Future Finance AI Challenge 대상

> **풀스택 선우**팀의 **깨비뚝딱**이 대상인 **금융감독원상**을 수상했습니다.

- 본선: 2026년 9월 2일, 이화여자대학교 이삼봉홀
- 경쟁: 전국 약 300개 참가팀 중 본선 10팀 진출
- 팀: 장선우(기획·디자인), 최선우(기획·프론트엔드), 박선우(기획·백엔드)
- 수상 기사: [한국경제](https://www.hankyung.com/article/202609032008P) · [더퍼스트미디어](https://www.thefirstmedia.net/news/articleView.html?idxno=207727) · [스마트투데이](https://www.smarttoday.co.kr/ko-kr/articles/111151)

<p align="center">
  <img src="./docs/images/kb-ai-challenge-fullstack-sunwoo.png" width="900" alt="풀스택 선우 팀 소개 - 장선우, 최선우, 박선우" />
</p>

---

## 서비스 소개

금융 앱에서 필요한 기능을 찾기 위해 여러 메뉴를 탐색하는 대신, 사용자가 자신의 상황을 말하면 깨비뚝딱이 의도를 분석합니다. 분석 결과에 따라 승인된 금융 위젯의 **종류·순서·데이터**를 동적으로 조합해 한 화면에 제공합니다.

> 깨비뚝딱은 정해진 화면 하나를 추천하는 서비스가 아닙니다. 생성형 AI가 사용자의 복합적인 상황을 해석해 필요한 금융 기능을 실시간으로 구성하는 **Generative UI** 서비스입니다.

### 핵심 사용자 흐름

```text
자연어 입력
  → AI 복합 의도 분석
  → 금융 위젯 선택 및 파라미터 추출
  → 서버 검증과 실제 데이터 결합
  → 사용자 맞춤 화면 렌더링
```

## 3가지 대표 시나리오

<table>
  <tr>
    <th width="33%">🚨 지갑 분실</th>
    <th width="33%">✈️ 해외여행 준비</th>
    <th width="33%">👥 동아리 회비 관리</th>
  </tr>
  <tr>
    <td align="center"><img src="./docs/images/scenario-wallet.png" width="250" alt="지갑 분실 시나리오" /></td>
    <td align="center"><img src="./docs/images/scenario-travel.png" width="250" alt="해외여행 준비 시나리오" /></td>
    <td align="center"><img src="./docs/images/scenario-club.png" width="250" alt="동아리 회비 관리 시나리오" /></td>
  </tr>
  <tr>
    <td>카드 일괄 정지, 카드 없는 스마트 ATM 출금, 신분증 분실 신고·재발급을 한 화면에 구성합니다.</td>
    <td>여행지 통화 충전, 현지 QR 결제, 여행 기간에 맞는 보험 위젯을 함께 구성합니다.</td>
    <td>회비 수납 현황, 지출 리포트, 모임카드 안전 설정을 총무용 화면으로 구성합니다.</td>
  </tr>
</table>

### 1. 지갑 분실 긴급 대응

```text
지갑을 잃어버렸어. 카드 정지하고 현금 찾는 방법이랑 신분증 재발급도 알려줘.
```

생성 위젯: `card_freeze_all` · `atm_smart_withdrawal` · `id_reissue_status_widget`

### 2. 해외여행 준비

```text
상하이로 3박 4일 여행 가는데 환전, QR 결제, 여행자보험 준비해줘.
```

생성 위젯: `travel_card_charge_widget` · `overseas_qr_payment_widget` · `travel_insurance_widget`

여행지, 통화 코드, 여행 일수, 요청 금액을 함께 추출하며 실제 환율은 서버가 별도 API로 조회합니다.

### 3. 동아리 회비 관리

```text
테니스 동아리 총무야. 이번 달 회비 수납 현황이랑 지출 리포트, 카드 안전 설정 보여줘.
```

생성 위젯: `group_account_status` · `expense_report_widget` · `group_card_safety_widget`

## 시스템 아키텍처

<p align="center">
  <img src="./docs/images/system-architecture.png" width="100%" alt="깨비뚝딱 시스템 아키텍처" />
</p>

AI는 **어떤 화면이 필요한지** 생성하고, 서버는 **정확한 데이터와 실행 가능성**을 보장합니다.

- **Dynamic UI Engine**: 복합 의도를 분석해 위젯 종류·순서·파라미터를 JSON으로 생성
- **Widget Registry & Guardrail**: 승인된 9개 위젯과 JSON Schema를 기준으로 필수 값·타입·범위를 검증
- **Secure Executor**: AI가 아닌 서버가 환율·수수료 계산, 입력값 재검증, 외부 API 호출과 결과 표준화를 담당
- **Fallback & Recovery**: JSON 파싱 실패, 미지원 요청, 외부 API 장애 시 재시도 또는 안전한 기본 화면으로 복구
- **Financial API Adapter**: 현재 환율 API에서 KB 계좌·카드, 본인인증, 공공기관, 결제·보험 API로 단계적 확장
- **Security & Operations**: OAuth 2.0, 개인정보 마스킹, 암호화, 감사 로그, Rate Limit, AI Trace와 CI/CD 적용
- **Human Confirmation**: 송금·결제·카드 정지 등 실제 금융 거래는 사용자 최종 확인 후 실행

## 기술적 특징

### 제한형 Generative UI

AI가 임의의 React 코드를 생성해 실행하지 않습니다. `Function Calling`의 enum과 JSON 스키마를 이용해 **승인된 9개 위젯 안에서만** 화면을 구성합니다. 이를 통해 생성형 AI의 유연성을 유지하면서도 예측 가능한 렌더링과 검증이 가능합니다.

### 금융 데이터와 AI 판단 분리

AI는 여행지에서 사용할 통화 코드와 필요한 기능을 판단하지만 실제 환율을 생성하지 않습니다. 환율과 계산 값은 Spring Boot 서버가 `open.er-api.com`에서 조회하며, 6시간 동안 인메모리 캐시합니다.

### 위젯 기반 확장

새로운 금융 시나리오는 페이지 전체를 다시 개발하는 대신 다음 두 요소를 추가해 확장할 수 있습니다.

1. 프론트엔드 위젯 컴포넌트
2. 백엔드 위젯 스키마 및 데이터 빌더

향후 KB 계좌·카드, 본인인증, 공공기관, 보험·결제 API도 어댑터 방식으로 연결할 수 있습니다.

## Tech Stack

| 영역 | 기술 |
| --- | --- |
| Frontend | React 19, React Router 7, Vite 8 |
| Styling | Tailwind CSS 4, Iconify |
| Backend | Java 17, Spring Boot 3.5, Maven |
| Generative AI | OpenAI `gpt-4o-mini`, Function Calling |
| External Data | Exchange Rate API (`open.er-api.com`) |
| Deployment | Netlify |
| Design | Figma |

## Widget Catalog

| 시나리오 | 위젯 타입 | 역할 |
| --- | --- | --- |
| 해외여행 | `travel_card_charge_widget` | 여행지 통화 충전 및 예상 원화 계산 |
| 해외여행 | `overseas_qr_payment_widget` | 현지 QR 결제 연결 |
| 해외여행 | `travel_insurance_widget` | 여행 기간 기반 보험 플랜 안내 |
| 동아리 | `group_account_status` | 회비 수납 및 미납 현황 |
| 동아리 | `expense_report_widget` | 월별 지출 분석 및 공유 |
| 동아리 | `group_card_safety_widget` | 결제 알림과 일일 한도 관리 |
| 긴급 | `card_freeze_all` | 보유 카드 일괄 정지 화면 |
| 긴급 | `atm_smart_withdrawal` | 카드 없는 ATM 출금 안내 |
| 긴급 | `id_reissue_status_widget` | 신분증 신고·재발급 절차 안내 |

## 로컬 실행

### 1. Backend 실행

백엔드 저장소를 내려받아 OpenAI API 키를 설정합니다.

```bash
git clone https://github.com/sunwoo030616/KKBB-ddook-ddak-back.git
cd KKBB-ddook-ddak-back
export OPENAI_API_KEY="your-openai-api-key"
./mvnw spring-boot:run
```

백엔드는 기본적으로 `http://localhost:8080`에서 실행됩니다.

### 2. Frontend 실행

```bash
git clone https://github.com/sunwoo030616/kkbb-ddook-ddak-front.git
cd kkbb-ddook-ddak-front
npm install
```

프로젝트 루트에 `.env.local`을 생성합니다.

```env
VITE_CHAT_API_URL=http://localhost:8080/api/canvas
```

개발 서버를 실행합니다.

```bash
npm run dev
```

브라우저에서 `http://localhost:5173`으로 접속합니다.

## API 사용 예시

```bash
curl -X POST http://localhost:8080/api/canvas \
  -H "Content-Type: application/json" \
  -d '{"message":"상하이로 3박 4일 여행 가는데 준비해줘"}'
```

응답 예시:

```json
{
  "greeting": "상하이 여행이라니, 깨비와 함께 즐거운 여행을 준비해봐요!",
  "widgets": [
    {
      "type": "travel_card_charge_widget",
      "currency": "CNY",
      "supported": true
    }
  ]
}
```

## 현재 구현 범위와 확장 계획

### 구현 완료

- 자연어 입력 → AI 의도 분석 → 위젯 조합 → 동적 화면 렌더링
- 3개 금융 시나리오와 9개 승인 위젯
- 여행지·통화·금액·모임명·여행 기간 구조화 추출
- 실시간 환율 조회와 6시간 캐시
- OpenAI 오류 시 빈 위젯 응답으로 안전한 폴백

### 향후 확장

- KB 계좌·카드 API 및 본인인증
- 정부24·경찰청 등 공공기관 API
- 실제 QR 결제, ATM, 보험 가입 연동
- 사용자별 권한 검증, 감사 로그, 개인정보 암호화
- AI 응답 품질 및 서비스 장애 모니터링

## Repository

- Frontend: [sunwoo030616/kkbb-ddook-ddak-front](https://github.com/sunwoo030616/kkbb-ddook-ddak-front)
- Backend: [sunwoo030616/KKBB-ddook-ddak-back](https://github.com/sunwoo030616/KKBB-ddook-ddak-back)

---

<div align="center">
  <strong>필요한 금융 기능을 찾지 말고, 상황을 말해보세요. 깨비가 화면을 뚝딱 만들어드립니다.</strong>
</div>
