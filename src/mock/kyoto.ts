import type { Itinerary } from '../types/itinerary'

// 一份 mock 行程，用来先把界面跑通（接 DeepSeek 前的占位）。
export const kyotoMock: Itinerary = {
  meta: {
    destination: '京都',
    days: 2,
    departureDate: '2026-07-10',
    pace: 'leisurely',
    companions: 'couple',
    mustVisit: ['清水寺'],
    avoid: '不爱人挤人的网红点',
    budgetTier: 'moderate',
    budgetNote: '大概一万以内',
    travelerTags: ['懒觉党', '爱吃', '怕排队'],
    travelerNote: '住祇园附近',
    season: '盛夏，午后闷热多雷阵雨',
  },
  greeting:
    '京都这季节正好，我给你排得松快些，早上不催你起床。午后最热，咱躲进店里慢慢吃。',
  days: [
    {
      dayIndex: 1,
      date: '2026-07-10',
      theme: '东山慢走',
      segments: [
        {
          period: 'morning',
          items: [
            {
              type: 'rest',
              name: '睡到自然醒，酒店早餐',
              area: '市中心',
              why: '你不爱早起，第一天不赶',
              butlerTip: '',
              timeHint: '10:00 前出门即可',
              durationHint: '',
              costHint: '',
              imageQuery: '京都 酒店早餐',
              confidence: 'high',
            },
          ],
        },
        {
          period: 'afternoon',
          items: [
            {
              type: 'sight',
              name: '清水寺',
              area: '东山区',
              why: '京都门面，坡道老街顺路逛',
              butlerTip: '怕排队的话别赶黄昏，午后人相对少',
              timeHint: '',
              durationHint: '约 2 小时',
              costHint: '门票 400 日元',
              imageQuery: '京都 清水寺',
              confidence: 'high',
            },
          ],
        },
        {
          period: 'evening',
          items: [
            {
              type: 'food',
              name: '祇园一带的怀石小店',
              area: '祇园',
              why: '你爱吃，晚上避开正午暑气慢慢吃',
              butlerTip: '热门店建议提前订位',
              timeHint: '',
              durationHint: '',
              costHint: '人均约 8000 日元',
              imageQuery: '京都 祇园 怀石料理',
              confidence: 'medium',
            },
          ],
        },
      ],
    },
    {
      dayIndex: 2,
      date: '2026-07-11',
      theme: '岚山竹林',
      segments: [
        {
          period: 'morning',
          items: [
            {
              type: 'sight',
              name: '岚山竹林小径',
              area: '岚山',
              why: '清晨人少光好，竹影最舒服',
              butlerTip: '想拍空镜就早点到，9 点后人渐多',
              timeHint: '',
              durationHint: '约 1.5 小时',
              costHint: '',
              imageQuery: '京都 岚山 竹林',
              confidence: 'high',
            },
          ],
        },
        {
          period: 'afternoon',
          items: [
            {
              type: 'sight',
              name: '渡月桥 + 河畔散步',
              area: '岚山',
              why: '配竹林顺路，慢慢晃不累',
              butlerTip: '',
              timeHint: '',
              durationHint: '',
              costHint: '',
              imageQuery: '京都 渡月桥',
              confidence: 'high',
            },
          ],
        },
        {
          period: 'evening',
          items: [
            {
              type: 'food',
              name: '锦市场附近找吃的',
              area: '市中心',
              why: '回市区，吃点热闹的收尾',
              butlerTip: '',
              timeHint: '',
              durationHint: '',
              costHint: '人均约 3000 日元',
              imageQuery: '京都 锦市场 美食',
              confidence: 'medium',
            },
          ],
        },
      ],
    },
  ],
  closing:
    '两天排得不紧，剩下的力气留给你随心逛。要我换口味或加一天，随时说。',
  disclaimer: '行程由 AI 生成，景点营业时间/价格请出行前再核实一次。',
}
