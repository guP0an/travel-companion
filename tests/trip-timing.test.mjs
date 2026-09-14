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
  assert.ok(timing('9.25到9.27', '4').question)
  assert.ok(timing('9.25到9.27', '0').question)
})
