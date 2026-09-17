import assert from 'node:assert/strict'
import test from 'node:test'
import { tripTiming } from '../node_modules/.tmp-tsnode/shared/tripTiming.js'
const now = new Date(2026,8,14)
const timing = (description,answer='',open=false) => tripTiming(description,answer,open,now)
test('dates determine inclusive duration; missing end dates can remain undecided', () => {
  assert.equal(timing('9.25–10.2 去云南').days,8)
  assert.equal(timing('2026-09-25到2026-10-02').days,8)
  assert.equal(timing('去云南玩八天').days,8)
  assert.ok(timing('9月25日去云南').question)
  assert.equal(timing('9月25日去云南','10月2日结束').days,8)
  assert.equal(timing('去云南','玩5天').days,5)
  assert.equal(timing('去云南','暂时没定').tentative,true)
  assert.equal(timing('9月25日去云南','',true).departureDate,'2026-09-25')
  assert.equal(timing('去云南','',true).days,3)
  assert.ok(timing('9.25到10.2 玩4天').question)
  assert.ok(timing('2月30日出发').question)
  assert.equal(timing('12.30–1.2').days,4)
  assert.ok(timing('去云南玩20天').question)
  assert.equal(timing('9.25去云南','还没想好').tentative,true)
  assert.equal(timing('9.25去云南','不知道').tentative,true)
})

test('bare follow-up numbers are day counts without interpreting destination numbers', () => {
  for (const answer of ['3', ' 3 ', '３', '3天', '玩3天']) {
    assert.equal(timing('中秋 去云南 目前主要是昆明和大理', answer).days, 3)
  }
  assert.equal(timing('去云南', '1').days, 1)
  assert.equal(timing('去云南', '15').days, 15)
  for (const answer of ['0', '16', '-1', '3.5']) {
    assert.equal(timing('去云南', answer).days, undefined)
    assert.ok(timing('去云南', answer).question)
  }
  assert.equal(timing('318川藏线').days, undefined)
  assert.equal(timing('9月25日出发', '3').departureDate, '2026-09-25')
  assert.equal(timing('9.25到9.27', '3').days, 3)
  assert.equal(timing('9.25到9.27', '4').days, 4)
  assert.ok(timing('9.25到9.27', '0').question)
})

test('follow-up durations and undecided answers resolve repeated or ambiguous dates', () => {
  const description = '9.25下午到昆明，假期9.25-10.7，提前两天回武汉'
  for (const answer of ['玩9-10天', '玩９～１０天', '玩九到十天']) {
    assert.deepEqual(timing(description, answer), { days: 10, departureDate: '2026-09-25', durationRange: true })
  }
  assert.equal(timing(description, '9').days, 9)
  assert.equal(timing(description, '', true).tentative, true)
  assert.equal(timing('9.25到昆明，9.25-10.7').days, 13)
  assert.equal(timing('去云南玩9-10天').days, 10)
  assert.equal(timing('9.25出发', '10月2日结束').days, 8)
  assert.equal(timing('9.25到9.25').days, 1)
  assert.equal(timing('9.25到9.27，预算不确定').days, 3)
  assert.equal(timing('玩5天，预算不确定').days, 5)
  for (const answer of ['玩10-9天', '玩0-10天', '玩9-16天']) assert.ok(timing(description, answer).question)
})

test('relative and rest days do not conflict with dates, and follow-up dates replace the old range', () => {
  const description = '9.25下午到昆明，假期9.25-10.7，需要提前两天回武汉调整作息'
  for (const answer of ['', '9.25–10.7', '９.２５–１０.７']) {
    assert.deepEqual(timing(description, answer), { days: 13, departureDate: '2026-09-25' })
  }
  for (const constraint of ['提前两天回家', '休息两天', '第2天去大理', '两天后去大理', '留两天调整作息']) {
    assert.equal(timing(`9.25到10.7，${constraint}`).days, 13)
  }
  assert.deepEqual(timing(description, '9.26到10.5'), { days: 10, departureDate: '2026-09-26' })
  assert.deepEqual(timing(description, '10月5日结束'), { days: 11, departureDate: '2026-09-25' })
  assert.deepEqual(timing('去云南', '10月1日出发玩5天'), { days: 5, departureDate: '2026-10-01' })
  assert.ok(timing('9.25到10.7，玩5天').question)
  assert.ok(timing(description, '9.31到10.7').question)
})
