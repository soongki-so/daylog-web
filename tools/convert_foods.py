"""식약처 '전국통합식품영양성분정보(음식) 표준데이터' (.xls) → 앱용 data/foods-kr.json

사용: python tools/convert_foods.py <받은 .xls 파일>

자료 특징 (2026-09 받은 파일 기준)
- 첫 줄은 비어 있고 두 번째 줄이 열 이름.
- 영양값은 100g(또는 100ml) 기준. '1인(회)분량 참고량'은 비어 있고, '식품중량'에 한 그릇·한 잔 무게가 있음
  → 1회 칼로리 = 100g당 × 식품중량 / 100.
- 같은 음식이 외식·가정식·급식별로 여러 줄 → 외식(분석) > 가정식(분석) > 외식(재료량) > 급식 순으로 하나만.
- 프랜차이즈 메뉴는 업체명(브랜드)을 붙여 따로 둔다.
- 이름 '대표_세부'(예: 김밥_참치)는 보기 좋게 '참치 김밥'으로, 원래 이름도 검색되게 따로 넣는다.

출력 항목: [보이는 이름, 1회 kcal, 기준(예 '250g'), 탄수화물g, 단백질g, 지방g, 분류, 추가 검색어]
"""
import json
import os
import re
import sys
from datetime import date

try:
    import xlrd
except ImportError:
    sys.exit('xlrd가 필요해요: python -m pip install --user xlrd')

# 기록 용도로는 외식 1인분이 가장 현실적이라 외식 값을 먼저 쓴다
PRIORITY = ['외식(분석함량)', '외식(재료량 기반 산출함량)', '가정식(분석 함량)', '외식(프랜차이즈',
            '산업체급식', '중고등학교급식', '초등학교급식']


def prio(origin):
    for i, p in enumerate(PRIORITY):
        if origin.startswith(p):
            return i
    return len(PRIORITY)


def num(v):
    m = re.search(r'-?\d+(?:\.\d+)?', str(v).replace(',', ''))
    return float(m.group()) if m else None


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    wb = xlrd.open_workbook(sys.argv[1], on_demand=True)
    sh = wb.sheet_by_index(0)
    hrow = next(r for r in range(0, 5) if '식품명' in sh.row_values(r))
    hdr = sh.row_values(hrow)
    ci = {h: i for i, h in enumerate(hdr)}
    need = ['식품명', '에너지(kcal)', '영양성분함량기준량', '탄수화물(g)', '단백질(g)', '지방(g)', '식품기원명', '업체명', '식품중량', '대표식품명']
    missing = [k for k in need if k not in ci]
    if missing:
        sys.exit(f'열을 찾지 못했어요: {missing}')

    # 1) 같은 이름끼리 모으기
    groups = {}
    for r in range(hrow + 1, sh.nrows):
        g = lambda k, r=r: str(sh.cell_value(r, ci[k])).strip()
        raw = g('식품명')
        kcal100 = num(g('에너지(kcal)'))
        if not raw or kcal100 is None:
            continue
        brand = g('업체명')
        brand = '' if brand in ('', '해당없음') else brand
        if '_' in raw:
            head, tail = raw.split('_', 1)
            tail = tail.replace('_', ' ')
            # '냉면_물냉면' → '물냉면' (세부 이름에 대표 이름이 이미 들어 있으면 붙이지 않음)
            plain = tail if head.replace(' ', '') in tail.replace(' ', '') else f'{tail} {head}'
            display = f'{tail} · {brand}' if brand else plain
        else:
            display = f'{raw} · {brand}' if brand else raw
        display = re.sub(r'\s+', ' ', display).strip()
        wtxt = g('식품중량')
        w = num(wtxt)
        groups.setdefault(re.sub(r'\s', '', display).lower(), []).append({
            'p': prio(g('식품기원명')), 'display': display, 'raw': raw, 'brand': brand,
            'kcal100': kcal100, 'base': num(g('영양성분함량기준량')) or 100.0, 'base_txt': g('영양성분함량기준량') or '100g',
            'w': w if (w and 0 < w <= 3000) else None, 'unit': 'ml' if 'ml' in wtxt.lower() else 'g',
            'carb': num(g('탄수화물(g)')), 'protein': num(g('단백질(g)')), 'fat': num(g('지방(g)')),
            'cat': g('대표식품명') or None,
        })

    # 2) 영양값은 우선순위가 가장 높은 줄, 한 그릇 무게는 무게가 있는 줄 중 우선순위 높은 것
    items = []
    for rows in groups.values():
        rows.sort(key=lambda x: x['p'])
        b = rows[0]
        # 분석용 줄은 식품중량이 시료 무게(100g)인 경우가 많아, 기준량과 다른 실제 그릇 무게를 먼저 찾는다
        wrow = next((x for x in rows if x['w'] and abs(x['w'] - x['base']) > 1), None)
        if wrow:
            factor = wrow['w'] / b['base']
            serving = f"{wrow['w']:g}{wrow['unit']}"
        else:
            factor, serving = 1.0, f"{b['base_txt']}당"
        conv = lambda v: (round(v * factor, 1) if v is not None else None)
        alt = re.sub(r'[_\s]', '', b['raw']) + b['brand']
        items.append([b['display'], int(round(b['kcal100'] * factor)), serving,
                      conv(b['carb']), conv(b['protein']), conv(b['fat']),
                      b['cat'] if b['cat'] and b['cat'] not in b['display'] else None,
                      alt if alt.lower() != re.sub(r'\s', '', b['display']).lower() else None])
    # 브랜드 없는 일반 음식을 앞에, 이름 짧은 순
    items.sort(key=lambda it: ('·' in it[0], len(it[0])))
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, 'foods-kr.json')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'source': '식품의약품안전처 전국통합식품영양성분정보(음식) 표준데이터',
                   'file': os.path.basename(sys.argv[1]), 'updated': date.today().isoformat(),
                   'count': len(items), 'items': items}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(items)}개 음식 → {os.path.normpath(out)} ({os.path.getsize(out) // 1024} KB)')
    for q in ('닭죽', '김치찌개', '비빔밥', '참치 김밥', '아메리카노'):
        hit = next((it for it in items if it[0] == q or it[0].startswith(q)), None)
        print('  예:', q, '→', hit)


if __name__ == '__main__':
    main()
