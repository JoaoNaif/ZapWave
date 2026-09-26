import { describe, expect, it, vi } from 'vitest'
import { AggregateRoot } from '../entities/aggregate-root'
import { UniqueEntityId } from '../entities/unique-entity-id'
import { DomainEvent } from './domain-event'
import { DomainEvents } from './domain-events'

class CustomAggregateCreated implements DomainEvent {
  public ocurredAt: Date
  private aggregate: CustomAggregate // eslint-disable-line

  constructor(aggregate: CustomAggregate) {
    this.aggregate = aggregate
    this.ocurredAt = new Date()
  }

  public getAggregateId(): UniqueEntityId {
    return this.aggregate.id
  }
}

class CustomAggregate extends AggregateRoot<null> {
  static create() {
    const aggregate = new CustomAggregate(null)

    aggregate.addDomainEvent(new CustomAggregateCreated(aggregate))

    return aggregate
  }
}

describe('domain events', () => {
  it('should be able to dispatch and listen to events', async () => {
    const callbackSpy = vi.fn()

    // Cadastro do subscribe
    DomainEvents.register(callbackSpy, CustomAggregateCreated.name)

    // Criando a resposta (Sem salvar no banco)
    const aggregate = CustomAggregate.create()

    // Espera que o enevto foi criado, mas não foi disparado
    expect(aggregate.domainEvents).toHaveLength(1)

    // Sando no banco e disparando o evento
    DomainEvents.dispatchEventsForAggregate(aggregate.id)

    // subscribe ouve o evento e trata o dado
    expect(callbackSpy).toHaveBeenCalled()

    // Espera que a lista de evento esteja vazia
    expect(aggregate.domainEvents).toHaveLength(0)
  })

  it('should not let a failing async handler crash the process', async () => {
    const onHandlerError = vi.fn()
    const previous = DomainEvents.onHandlerError
    DomainEvents.onHandlerError = onHandlerError
    DomainEvents.clearHandlers()

    const failure = new Error('database is down')
    DomainEvents.register(async () => {
      throw failure
    }, CustomAggregateCreated.name)

    const aggregate = CustomAggregate.create()
    DomainEvents.dispatchEventsForAggregate(aggregate.id)

    // a rejeição é tratada no próximo tick da fila de promises
    await new Promise((resolve) => setImmediate(resolve))

    expect(onHandlerError).toHaveBeenCalledWith(failure, expect.anything())

    DomainEvents.onHandlerError = previous
    DomainEvents.clearHandlers()
  })

  it('should also report a handler that throws synchronously', () => {
    const onHandlerError = vi.fn()
    const previous = DomainEvents.onHandlerError
    DomainEvents.onHandlerError = onHandlerError
    DomainEvents.clearHandlers()

    DomainEvents.register(() => {
      throw new Error('boom')
    }, CustomAggregateCreated.name)

    const aggregate = CustomAggregate.create()
    DomainEvents.dispatchEventsForAggregate(aggregate.id)

    expect(onHandlerError).toHaveBeenCalledTimes(1)

    DomainEvents.onHandlerError = previous
    DomainEvents.clearHandlers()
  })
})
