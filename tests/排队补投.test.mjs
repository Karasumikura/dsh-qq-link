// ⭐ 1.6.7（issue #41）：会话没活着时消息排队、活着补投。
//   这里只测**队列本身**（存/读/去重/上限/保留时长），不拉起整个插件。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 把插件里那套逻辑按同样的规则复刻一份来测（纯文件操作，不依赖插件运行时）
function 造排队(文件, 配置) {
  const 读排队 = () => {
    try {
      const j = JSON.parse(readFileSync(文件, 'utf8'))
      return Array.isArray(j) ? j : []
    } catch {
      return []
    }
  }
  const 存排队 = (队列) => writeFileSync(文件, JSON.stringify(队列, null, 2), 'utf8')
  const 放入 = (项) => {
    if (配置.排队不丢 === false) return false
    const 队列 = 读排队()
    if (队列.some((x) => x && String(x.message_id) === String(项.message_id))) return false
    队列.push(项)
    const 上限 = Math.max(1, Number(配置.排队上限) || 50)
    const 留时 = Math.max(1, Number(配置.排队保留小时) || 24) * 3600 * 1000
    const 现 = Date.now()
    let 收 = 队列.filter((x) => x && 现 - Number(x.收到 || 0) < 留时)
    const 丢旧 = 收.length - 上限
    if (丢旧 > 0) 收 = 收.slice(丢旧)
    存排队(收)
    return true
  }
  const 删 = (id) => 存排队(读排队().filter((x) => String(x.message_id) !== String(id)))
  return { 读排队, 放入, 删 }
}

const 目录 = mkdtempSync(join(tmpdir(), 'qq排队-'))
const 文件 = join(目录, 'qq-排队.json')

test('放进去了、能读出来、按 id 删掉', () => {
  const q = 造排队(文件, {})
  assert.equal(q.放入({ message_id: 'a1', 文字: '第一句', 收到: Date.now() }), true)
  assert.equal(q.放入({ message_id: 'a2', 文字: '第二句', 收到: Date.now() }), true)
  assert.deepEqual(q.读排队().map((x) => x.message_id), ['a1', 'a2'])
  q.删('a1')
  assert.deepEqual(q.读排队().map((x) => x.message_id), ['a2'])
})

test('同一条不会排两次（去重）', () => {
  const q = 造排队(文件, {})
  q.删('a2')
  assert.equal(q.放入({ message_id: 'b1', 文字: 'x', 收到: Date.now() }), true)
  assert.equal(q.放入({ message_id: 'b1', 文字: 'x', 收到: Date.now() }), false)
  assert.equal(q.读排队().length, 1)
})

test('开关关着就不排（回到老语义）', () => {
  const q = 造排队(join(目录, 'q2.json'), { 排队不丢: false })
  assert.equal(q.放入({ message_id: 'c1', 文字: 'x', 收到: Date.now() }), false)
  assert.equal(q.读排队().length, 0)
})

test('超过上限丢最旧的', () => {
  const q = 造排队(join(目录, 'q3.json'), { 排队上限: 3 })
  for (const id of ['d1', 'd2', 'd3', 'd4']) q.放入({ message_id: id, 文字: id, 收到: Date.now() })
  assert.deepEqual(q.读排队().map((x) => x.message_id), ['d2', 'd3', 'd4'])
})

test('放太久的会被清掉（保留时长）', () => {
  const q = 造排队(join(目录, 'q4.json'), { 排队保留小时: 1 })
  const 老 = Date.now() - 2 * 3600 * 1000
  writeFileSync(join(目录, 'q4.json'), JSON.stringify([{ message_id: 'old', 收到: 老 }]), 'utf8')
  q.放入({ message_id: 'new', 文字: 'x', 收到: Date.now() })
  assert.deepEqual(q.读排队().map((x) => x.message_id), ['new'])
})

test('队列文件坏了不会把插件带崩', () => {
  const 坏 = join(目录, 'q5.json')
  writeFileSync(坏, '这不是 json{{{', 'utf8')
  const q = 造排队(坏, {})
  assert.deepEqual(q.读排队(), [])
  assert.equal(q.放入({ message_id: 'e1', 文字: 'x', 收到: Date.now() }), true)
  assert.equal(q.读排队().length, 1)
})

test.after(() => {
  try {
    rmSync(目录, { recursive: true, force: true })
  } catch {}
})
