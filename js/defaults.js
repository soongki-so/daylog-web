// 기본 마스터 데이터와 상수

export const MEAL_TYPES = [
  { key: 'breakfast', label: '아침', icon: '🌅' },
  { key: 'lunch', label: '점심', icon: '☀️' },
  { key: 'dinner', label: '저녁', icon: '🌙' },
  { key: 'snack', label: '간식', icon: '🍪' },
];

export const SATIETY = [
  { v: 1, face: '😣', label: '매우 부족' },
  { v: 2, face: '😕', label: '부족' },
  { v: 3, face: '🙂', label: '적당' },
  { v: 4, face: '😊', label: '든든' },
  { v: 5, face: '🥴', label: '너무 배부름' },
];

export const RATINGS = [
  { v: 1, face: '😫', label: '힘들었어요' },
  { v: 2, face: '😕', label: '별로' },
  { v: 3, face: '😐', label: '그럭저럭' },
  { v: 4, face: '🙂', label: '괜찮았어요' },
  { v: 5, face: '😄', label: '최고' },
];

export const MED_SLOTS = [
  { key: 'breakfast', label: '아침', icon: '🌅' },
  { key: 'lunch', label: '점심', icon: '☀️' },
  { key: 'dinner', label: '저녁', icon: '🌙' },
  { key: 'bedtime', label: '취침 전', icon: '🛏️' },
];

export const EXERCISE_TYPES = ['걷기', '러닝', '헬스', 'PT', '자전거', '수영', '요가/필라테스', '등산', '기타'];

export const DEFAULT_MASTERS = {
  id: 'main',
  presets: [
    { id: 'p_shake', name: '아침 쉐이크', items: '단백질 쉐이크, 바나나', kcal: 250, mealType: 'breakfast', favorite: true, order: 1 },
    { id: 'p_salad', name: '점심 샐러드', items: '닭가슴살 샐러드', kcal: 450, mealType: 'lunch', favorite: true, order: 2 },
    { id: 'p_bodyki', name: '바디키', items: '도시락', kcal: 520, mealType: 'lunch', favorite: true, order: 3 },
    { id: 'p_normal', name: '일반식', items: '밥, 국, 반찬', kcal: 700, mealType: null, favorite: false, order: 4 },
    { id: 'p_out', name: '외식', items: '', kcal: 900, mealType: null, favorite: false, order: 5 },
  ],
  medications: [],
  medSets: [
    { id: 's_med_am', name: '아침약', kind: 'medication', slots: ['breakfast'], active: true, order: 1,
      items: [{ id: 'i_synth', name: '신지로이드' }, { id: 'i_bp', name: '혈압약' }] },
    { id: 's_supp', name: '영양제', kind: 'supplement', slots: ['breakfast'], active: true, order: 2,
      items: [{ id: 'i_dx', name: '더블엑스' }, { id: 'i_slim', name: '슬림팩' }, { id: 'i_pro', name: '유산균' }] },
  ],
  tags: [
    { id: 't_period', name: '생리', icon: '🩸', active: true, order: 1 },
    { id: 't_party', name: '회식', icon: '🍻', active: true, order: 2 },
    { id: 't_eatout', name: '외식', icon: '🍽️', active: true, order: 3 },
    { id: 't_trip', name: '여행', icon: '✈️', active: true, order: 4 },
    { id: 't_camp', name: '캠핑', icon: '🏕️', active: true, order: 5 },
    { id: 't_med', name: '수술/시술', icon: '🏥', active: true, order: 6 },
    { id: 't_sick', name: '질병', icon: '🤒', active: true, order: 7 },
  ],
  settings: {
    waterGoalMl: 2000,
    waterQuick: [200, 300, 500],
    restingEnergy: 1300,
    injectionName: '마운자로',
    injectionDefaultMg: 2.5,
    dayBoundaryHour: 0,
    ptTotal: 30,   // PT 등록 총 횟수
    ptDone: 0,     // 앱 쓰기 전에 이미 한 PT 횟수
  },
};
