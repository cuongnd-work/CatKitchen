import { EventTarget, Node } from 'cc';

export enum CustomersQueueEvent {
    ORDER_COMPLETED = 'customers:order-completed',
}

export type CustomersQueueOrderPayload = Node;

class CustomersQueueEventBus extends EventTarget {
    emitOrderCompleted (customer: Node): void {
        this.emit(CustomersQueueEvent.ORDER_COMPLETED, customer);
    }
}

export const CustomersQueueEvents = new CustomersQueueEventBus();
