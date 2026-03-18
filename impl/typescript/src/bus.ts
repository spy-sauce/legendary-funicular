// Mycelium Framework — VibeSpace LLC — The network provides.

import { EventEmitter } from "node:events";
import Redis from "ioredis";

/**
 * Chemical signals propagating through the hyphal network.
 * Each type corresponds to a distinct signaling molecule.
 */
export enum MyceliumEventType {
  /** Periodic vitality broadcast — like bioluminescent pulses in Mycena. */
  HEALTH_PULSE = "HEALTH_PULSE",
  /** An agent advertises surplus nutrients for translocation. */
  NUTRIENT_OFFER = "NUTRIENT_OFFER",
  /** An agent broadcasts a chemotropic request for a specific substrate. */
  NUTRIENT_REQUEST = "NUTRIENT_REQUEST",
  /** Colony-wide notice that a symbiotic contract has mutated. */
  CONTRACT_UPDATE = "CONTRACT_UPDATE",
  /** A fruiting body has matured and is ready for spore dispersal. */
  FRUIT_READY = "FRUIT_READY",
  /** Orchestrator signals that a merge window is opening. */
  MERGE_SIGNAL = "MERGE_SIGNAL",
}

/** Envelope for every signal traversing the mycelial bus. */
export interface MyceliumEvent<T = unknown> {
  readonly type: MyceliumEventType;
  readonly sourceId: string;
  readonly payload: T;
  readonly timestamp: number;
  /** Optional correlation spore — links related signals across the colony. */
  readonly traceId?: string;
}

/** Callback shape for event subscribers — hyphae listening at septal pores. */
export type EventListener<T = unknown> = (event: MyceliumEvent<T>) => void | Promise<void>;

/**
 * Transport-agnostic interface for the mycelial signaling network.
 * Observation: the bus is analogous to the common mycelial network (CMN)
 * connecting multiple plants in a forest — signals flow to all subscribers.
 */
export interface EventBus {
  /** Attach a hypha to a particular signal channel. */
  subscribe<T = unknown>(type: MyceliumEventType, listener: EventListener<T>): void;

  /** Detach a hypha from a signal channel. */
  unsubscribe<T = unknown>(type: MyceliumEventType, listener: EventListener<T>): void;

  /** Broadcast a signal through the network. */
  publish<T = unknown>(event: MyceliumEvent<T>): Promise<void>;

  /** Gracefully degrade the signaling network. */
  destroy(): Promise<void>;
}

// ── Local bus — single-colony, in-process signaling ─────────

/**
 * In-memory event bus using Node's EventEmitter.
 *
 * Field note: suitable for monoculture experiments on a single substrate.
 * For distributed colonies spanning multiple hosts, use RedisEventBus.
 */
export class LocalEventBus implements EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Mycelial networks can be dense — raise the listener ceiling.
    this.emitter.setMaxListeners(256);
  }

  subscribe<T = unknown>(type: MyceliumEventType, listener: EventListener<T>): void {
    this.emitter.on(type, listener as (...args: unknown[]) => void);
  }

  unsubscribe<T = unknown>(type: MyceliumEventType, listener: EventListener<T>): void {
    this.emitter.off(type, listener as (...args: unknown[]) => void);
  }

  async publish<T = unknown>(event: MyceliumEvent<T>): Promise<void> {
    this.emitter.emit(event.type, event);
  }

  async destroy(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}

// ── Redis bus — distributed colony signaling via pub/sub ────

/**
 * Redis-backed event bus for multi-host mycelial networks.
 *
 * Observation: ioredis pub/sub requires separate connections for
 * subscribing and publishing — like afferent and efferent hyphae
 * carrying signals in opposite directions through the same cord.
 */
export class RedisEventBus implements EventBus {
  /** Afferent connection — receives incoming signals. */
  private readonly subscriber: Redis;
  /** Efferent connection — transmits outgoing signals. */
  private readonly publisher: Redis;

  /** Local dispatch table — routes deserialized signals to listeners. */
  private readonly listeners = new Map<MyceliumEventType, Set<EventListener>>();

  /** Channel prefix — isolates this colony's signals from others on the same Redis. */
  private readonly channelPrefix: string;

  constructor(config: { redisUrl?: string; channelPrefix?: string } = {}) {
    const url = config.redisUrl ?? "redis://127.0.0.1:6379";
    this.channelPrefix = config.channelPrefix ?? "mycelium:";

    this.subscriber = new Redis(url);
    this.publisher = new Redis(url);

    // Wire the afferent hypha: deserialize and dispatch.
    this.subscriber.on("message", (channel: string, message: string) => {
      const type = channel.replace(this.channelPrefix, "") as MyceliumEventType;
      const listeners = this.listeners.get(type);
      if (!listeners?.size) return;

      try {
        const event = JSON.parse(message) as MyceliumEvent;
        for (const listener of listeners) {
          // Fire-and-forget — a single blocked hypha must not stall the network.
          void Promise.resolve(listener(event)).catch((err: unknown) => {
            console.error(`[mycelium] listener error on ${type}:`, err);
          });
        }
      } catch {
        // Malformed spore — discard silently.
        console.warn(`[mycelium] failed to parse message on channel ${channel}`);
      }
    });
  }

  async subscribe<T = unknown>(type: MyceliumEventType, listener: EventListener<T>): Promise<void> {
    const channel = `${this.channelPrefix}${type}`;

    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
      await this.subscriber.subscribe(channel);
    }

    this.listeners.get(type)!.add(listener as EventListener);
  }

  unsubscribe<T = unknown>(type: MyceliumEventType, listener: EventListener<T>): void {
    const set = this.listeners.get(type);
    if (!set) return;

    set.delete(listener as EventListener);

    if (set.size === 0) {
      this.listeners.delete(type);
      // Unsubscribe from the Redis channel — no listeners remain on this pore.
      void this.subscriber.unsubscribe(`${this.channelPrefix}${type}`);
    }
  }

  async publish<T = unknown>(event: MyceliumEvent<T>): Promise<void> {
    const channel = `${this.channelPrefix}${event.type}`;
    await this.publisher.publish(channel, JSON.stringify(event));
  }

  async destroy(): Promise<void> {
    this.listeners.clear();
    await this.subscriber.quit();
    await this.publisher.quit();
  }
}
