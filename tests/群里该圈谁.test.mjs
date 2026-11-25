// 群里回复该 @ 谁（2026-11-25 用户反馈：群里引用回复不能 at）
//
// 事故原貌：
//   群里 A 说话叫醒了会话 → 会话调 qq_quote 引用的是**更早的 B 那条** → 回的时候
//   老逻辑只看「是谁叫醒我的」（A），于是 @ 了 A；如果这一轮根本不是 QQ 叫醒的，
//   「叫醒我的人」是 null，就一个 @ 都不挂 —— 表现就是「引用回复不能 at」。
//
// 现在的规则：引用某条消息时，@ **被引用那条的发送者**；没有引用才退回「叫醒我的人」。
import test from 'node:test'
import assert from 'node:assert/strict'

const home = process.env.DSH_HOME || ''
process.env.DSH_HOME = home || 'C:\\Windows\\Temp'
const { 该圈谁 } = await import('../lib/host.js')

test('引用别人的消息 → @ 被引用那条的发送者（不是叫醒我的那个）', () => {
  const 引用者 = { 号: '2222', 群: true }   // 被引用那条是谁发的
  const 圈人 = { 号: '1111', 群: true }     // 叫醒这一轮的人
  assert.deepEqual(该圈谁(引用者, 圈人), { 号: '2222', 群: true })
})

test('引用了、但这轮不是 QQ 叫醒的（圈人 null）→ 照样 @ 被引用的人', () => {
  // 这就是原来的坑：圈人 null 时老逻辑一个 @ 都不挂
  assert.deepEqual(该圈谁({ 号: '2222', 群: true }, null), { 号: '2222', 群: true })
})

test('没引用 → 退回 @ 叫醒我的人', () => {
  assert.deepEqual(该圈谁(null, { 号: '1111', 群: true }), { 号: '1111', 群: true })
})

test('私聊不 @（群标记是 false）', () => {
  assert.equal(该圈谁({ 号: '2222', 群: false }, { 号: '1111', 群: false }), null)
  assert.equal(该圈谁({ 号: '2222' }, { 号: '1111' }), null)
})

test('没有号码 → 不 @（不能拼出一个空的 at 段）', () => {
  assert.equal(该圈谁({ 号: '', 群: true }, { 号: '', 群: true }), null)
  assert.equal(该圈谁({ 群: true }, null), null)
})

test('都有 → 引用优先（哪怕两个人不一样）', () => {
  assert.equal(该圈谁({ 号: '999', 群: true }, { 号: '111', 群: true }).号, '999')
})

test('引用者是个不完整对象（旧的字符串路径漏进来的）→ 退回圈人', () => {
  assert.deepEqual(该圈谁('12345', { 号: '1111', 群: true }), { 号: '1111', 群: true })
  assert.deepEqual(该圈谁({ id: '12345' }, { 号: '1111', 群: true }), { 号: '1111', 群: true })
})
