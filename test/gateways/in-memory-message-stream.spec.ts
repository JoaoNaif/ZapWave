import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryMessageStream } from './in-memory-message-stream'
import { makeMessage } from 'test/factories/make-message'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Message } from '@/domain/chat/entities/message'

let sut: InMemoryMessageStream

function makeMessageWithId(id: string) {
  return makeMessage(
    { conversationId: new UniqueEntityId('conversation-1') },
    new UniqueEntityId(id)
  )
}

async function collect(iterable: AsyncIterable<Message>) {
  const ids: string[] = []

  for await (const message of iterable) {
    ids.push(message.id.toString())
  }

  return ids
}

describe('In Memory Message Stream', () => {
  beforeEach(() => {
    sut = new InMemoryMessageStream()
  })

  describe('replayFrom', () => {
    it('should replay every pending message of the device in order when there is no cursor', async () => {
      await sut.publish('conversation-1', makeMessageWithId('msg-1'), [
        'device-1',
      ])
      await sut.publish('conversation-1', makeMessageWithId('msg-2'), [
        'device-1',
      ])

      expect(await collect(sut.replayFrom('device-1', null))).toEqual([
        'msg-1',
        'msg-2',
      ])
    })

    it('should replay only the messages after the cursor', async () => {
      for (const id of ['msg-1', 'msg-2', 'msg-3']) {
        await sut.publish('conversation-1', makeMessageWithId(id), ['device-1'])
      }

      expect(await collect(sut.replayFrom('device-1', 'msg-1'))).toEqual([
        'msg-2',
        'msg-3',
      ])
    })

    it('should keep one inbox per device', async () => {
      await sut.publish('conversation-1', makeMessageWithId('msg-1'), [
        'device-1',
        'device-2',
      ])
      await sut.publish('conversation-1', makeMessageWithId('msg-2'), [
        'device-2',
      ])

      expect(await collect(sut.replayFrom('device-1', null))).toEqual(['msg-1'])
      expect(await collect(sut.replayFrom('device-2', null))).toEqual([
        'msg-1',
        'msg-2',
      ])
    })

    it('should finish without messages for a device with an empty inbox', async () => {
      expect(await collect(sut.replayFrom('ghost-device', null))).toEqual([])
    })
  })

  describe('ack', () => {
    it('should remove the acknowledged message and the older ones from the inbox', async () => {
      for (const id of ['msg-1', 'msg-2', 'msg-3']) {
        await sut.publish('conversation-1', makeMessageWithId(id), ['device-1'])
      }

      await sut.ack('device-1', 'msg-2')

      expect(await collect(sut.replayFrom('device-1', null))).toEqual(['msg-3'])
    })

    it('should not touch the inbox of other devices', async () => {
      await sut.publish('conversation-1', makeMessageWithId('msg-1'), [
        'device-1',
        'device-2',
      ])

      await sut.ack('device-1', 'msg-1')

      expect(await collect(sut.replayFrom('device-2', null))).toEqual(['msg-1'])
    })
  })

  describe('subscribe', () => {
    it('should deliver messages published after the consumer started', async () => {
      const iterator = sut.subscribe('device-1')[Symbol.asyncIterator]()

      const next = iterator.next()
      await sut.publish('conversation-1', makeMessageWithId('msg-1'), [
        'device-1',
      ])

      const result = await next

      expect(result.done).toBe(false)
      expect(String(result.value.id)).toBe('msg-1')

      await iterator.return?.()
    })

    it('should buffer messages published while the consumer is not reading', async () => {
      const iterator = sut.subscribe('device-1')[Symbol.asyncIterator]()

      const first = iterator.next()
      await sut.publish('conversation-1', makeMessageWithId('msg-1'), [
        'device-1',
      ])
      await sut.publish('conversation-1', makeMessageWithId('msg-2'), [
        'device-1',
      ])
      await sut.publish('conversation-1', makeMessageWithId('msg-3'), [
        'device-1',
      ])

      const ids = [
        String((await first).value.id),
        String((await iterator.next()).value.id),
        String((await iterator.next()).value.id),
      ]

      expect(ids).toEqual(['msg-1', 'msg-2', 'msg-3'])

      await iterator.return?.()
    })

    it('should only deliver messages addressed to its own device', async () => {
      const iterator = sut.subscribe('device-1')[Symbol.asyncIterator]()

      const next = iterator.next()
      await sut.publish('conversation-1', makeMessageWithId('msg-1'), [
        'device-2',
      ])
      await sut.publish('conversation-1', makeMessageWithId('msg-2'), [
        'device-1',
      ])

      expect(String((await next).value.id)).toBe('msg-2')

      await iterator.return?.()
    })

    it('should stop listening when the consumer stops', async () => {
      const iterator = sut.subscribe('device-1')[Symbol.asyncIterator]()

      const next = iterator.next()
      await sut.publish('conversation-1', makeMessageWithId('msg-1'), [
        'device-1',
      ])
      await next

      const done = await iterator.return?.()

      expect(done?.done).toBe(true)
      // publicar depois do fim do consumo não pode quebrar nem acumular
      await expect(
        sut.publish('conversation-1', makeMessageWithId('msg-2'), ['device-1'])
      ).resolves.toBeUndefined()
    })
  })
})
