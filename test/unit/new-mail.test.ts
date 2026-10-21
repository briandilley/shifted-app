import { describe, expect, it } from 'vitest'
import type { FeedEntry } from '../../src/main/feed'
import { NewMailTracker, newMailNotifications, senderName } from '../../src/main/new-mail'

function entry(id: string, title = `Subject ${id}`, authorName = `Sender ${id}`): FeedEntry {
  return {
    id,
    title,
    authorName,
    authorEmail: `${id}@example.com`,
    issued: '2026-10-21T08:00:00Z',
    link: `https://mail.example/?message_id=${id}`
  }
}

const PRIMARY = '%5Esq_ig_i_personal'

describe('NewMailTracker', () => {
  it('the first read fills the set and returns no new messages', () => {
    const tracker = new NewMailTracker()
    expect(tracker.read('a', PRIMARY, [entry('1'), entry('2')])).toEqual([])
  })

  it('a later read returns only the new IDs', () => {
    const tracker = new NewMailTracker()
    tracker.read('a', PRIMARY, [entry('1'), entry('2')])
    expect(tracker.read('a', PRIMARY, [entry('3'), entry('1'), entry('2')])).toEqual([entry('3')])
    expect(tracker.read('a', PRIMARY, [entry('3'), entry('1')])).toEqual([])
  })

  it('a message that leaves the feed and comes back is not new again', () => {
    const tracker = new NewMailTracker()
    tracker.read('a', PRIMARY, [entry('1')])
    tracker.read('a', PRIMARY, [])
    expect(tracker.read('a', PRIMARY, [entry('1')])).toEqual([])
  })

  it('keeps one set for each account', () => {
    const tracker = new NewMailTracker()
    tracker.read('a', PRIMARY, [entry('1')])
    // The first read of account b only fills its set.
    expect(tracker.read('b', PRIMARY, [entry('1'), entry('2')])).toEqual([])
    expect(tracker.read('a', PRIMARY, [entry('1'), entry('2')])).toEqual([entry('2')])
  })

  it('after forget, and after a change of feed, the next read only fills the set', () => {
    const tracker = new NewMailTracker()
    tracker.read('a', PRIMARY, [entry('1')])
    tracker.forget('a')
    expect(tracker.read('a', PRIMARY, [entry('1'), entry('2')])).toEqual([])
    expect(tracker.read('a', '', [entry('1'), entry('2'), entry('3')])).toEqual([])
    expect(tracker.read('a', '', [entry('4'), entry('3')])).toEqual([entry('4')])
  })

  it('returns each new ID once, and ignores entries with no ID', () => {
    const tracker = new NewMailTracker()
    tracker.read('a', PRIMARY, [])
    expect(tracker.read('a', PRIMARY, [entry('5'), entry('5'), entry('')])).toEqual([entry('5')])
  })
})

describe('newMailNotifications', () => {
  it('makes one notification for each new message, with the sender name, then the subject', () => {
    const notifications = newMailNotifications('Work', [entry('1', 'Lunch?', 'Ana')])
    expect(notifications).toEqual([
      { title: 'Work', body: 'Ana\nLunch?', entry: entry('1', 'Lunch?', 'Ana') }
    ])
  })

  it('makes 3 notifications for 3 new messages', () => {
    const notifications = newMailNotifications('a@example.com', [
      entry('1'),
      entry('2'),
      entry('3')
    ])
    expect(notifications.map((n) => n.entry?.id)).toEqual(['1', '2', '3'])
  })

  it('more than 3 new messages give one summary', () => {
    const entries = ['1', '2', '3', '4', '5'].map((id) => entry(id))
    expect(newMailNotifications('Work', entries)).toEqual([
      { title: 'Work', body: '5 new messages', entry: null }
    ])
  })

  it('no new messages give no notification', () => {
    expect(newMailNotifications('Work', [])).toEqual([])
  })

  it('uses the address when the feed gives no sender name, and a word for no subject', () => {
    expect(senderName({ ...entry('1'), authorName: '' })).toBe('1@example.com')
    expect(newMailNotifications('Work', [entry('1', '', 'Ana')])[0]?.body).toBe('Ana\n(no subject)')
  })
})
