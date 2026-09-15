# DayLog

개인 다이어트 기록 웹앱. 식사·수분·운동·수면·체중·약·투약·특이사항·하루평가를 한 화면에서 기록하고,
달력으로 돌아보고, 그래프로 변화를 봅니다.

- 아이폰·아이패드·안드로이드·윈도우 어디서든 브라우저로 열립니다.
- 홈 화면에 추가하면 앱처럼 씁니다. (아이폰: Safari 공유 버튼 → "홈 화면에 추가")
- 1단계(현재): 데이터는 **이 기기 브라우저 안에만** 저장됩니다. 설정 → 데이터 → 내보내기로 백업하세요.
- 2단계(예정): 계정 로그인 + 기기 간 동기화 + 가족/PT 공유.

## 구조

```
index.html            앱 껍데기
manifest.webmanifest  홈 화면 앱 정보
sw.js                 오프라인 캐시
css/app.css
js/app.js             탭 전환, 상태
js/store.js           데이터 저장 (IndexedDB) — 2단계에서 이 파일만 교체
js/db.js              IndexedDB 래퍼
js/date.js            날짜 유틸
js/defaults.js        기본 프리셋/약/태그/설정
js/ui.js              DOM 도우미, 시트, 토스트, 링
js/charts.js          SVG 선/막대 차트
js/views/today.js     오늘 화면
js/views/calendar.js  달력
js/views/trends.js    변화(그래프)
js/views/settings.js  설정
```

빌드 도구 없음. 파일을 그대로 정적 호스팅(GitHub Pages)하면 됩니다.

## 로컬에서 열기

```bash
python -m http.server 8765
```

브라우저에서 http://localhost:8765 접속.
