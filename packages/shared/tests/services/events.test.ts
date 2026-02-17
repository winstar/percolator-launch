import { describe, it, expect, vi } from "vitest";
import { eventBus } from "../../src/services/events.js";
import type { EventPayload } from "../../src/services/events.js";

describe("EventBus", () => {
  it("should publish and subscribe to events", () => {
    const listener = vi.fn();

    const unsubscribe = eventBus.subscribe("market.created", listener);

    eventBus.publish("market.created", "test-slab-address", { test: "data" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "market.created",
        slabAddress: "test-slab-address",
        data: { test: "data" },
        timestamp: expect.any(Number),
      })
    );

    unsubscribe();
  });

  it("should allow wildcard listener to receive all events", () => {
    const wildcardListener = vi.fn();

    const unsubscribe = eventBus.subscribe("*", wildcardListener);

    eventBus.publish("market.created", "slab-1", { foo: "bar" });
    eventBus.publish("price.updated", "slab-2", { price: 100 });
    eventBus.publish("trade.executed", "slab-3", { size: 50 });

    expect(wildcardListener).toHaveBeenCalledTimes(3);

    // Check all three events were received
    expect(wildcardListener).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "market.created",
        slabAddress: "slab-1",
      })
    );

    expect(wildcardListener).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        event: "price.updated",
        slabAddress: "slab-2",
      })
    );

    expect(wildcardListener).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        event: "trade.executed",
        slabAddress: "slab-3",
      })
    );

    unsubscribe();
  });

  it("should allow unsubscribe to stop receiving events", () => {
    const listener = vi.fn();

    const unsubscribe = eventBus.subscribe("market.updated", listener);

    eventBus.publish("market.updated", "slab-1", {});
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    eventBus.publish("market.updated", "slab-2", {});
    expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
  });

  it("should track subscription count", () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const listener3 = vi.fn();

    expect(eventBus.getSubscriptionCount("crank.success")).toBe(0);

    const unsub1 = eventBus.subscribe("crank.success", listener1);
    expect(eventBus.getSubscriptionCount("crank.success")).toBe(1);

    const unsub2 = eventBus.subscribe("crank.success", listener2);
    expect(eventBus.getSubscriptionCount("crank.success")).toBe(2);

    const unsub3 = eventBus.subscribe("crank.success", listener3);
    expect(eventBus.getSubscriptionCount("crank.success")).toBe(3);

    unsub1();
    expect(eventBus.getSubscriptionCount("crank.success")).toBe(2);

    unsub2();
    expect(eventBus.getSubscriptionCount("crank.success")).toBe(1);

    unsub3();
    expect(eventBus.getSubscriptionCount("crank.success")).toBe(0);
  });

  it("should track wildcard subscriptions separately", () => {
    const wildcardListener = vi.fn();
    const specificListener = vi.fn();

    expect(eventBus.getSubscriptionCount("*")).toBe(0);
    expect(eventBus.getSubscriptionCount("trade.executed")).toBe(0);

    const unsubWildcard = eventBus.subscribe("*", wildcardListener);
    expect(eventBus.getSubscriptionCount("*")).toBe(1);

    const unsubSpecific = eventBus.subscribe("trade.executed", specificListener);
    expect(eventBus.getSubscriptionCount("trade.executed")).toBe(1);

    // Wildcard count should remain separate
    expect(eventBus.getSubscriptionCount("*")).toBe(1);

    unsubWildcard();
    unsubSpecific();

    expect(eventBus.getSubscriptionCount("*")).toBe(0);
    expect(eventBus.getSubscriptionCount("trade.executed")).toBe(0);
  });

  it("should handle multiple listeners for same event", () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const listener3 = vi.fn();

    const unsub1 = eventBus.subscribe("price.updated", listener1);
    const unsub2 = eventBus.subscribe("price.updated", listener2);
    const unsub3 = eventBus.subscribe("price.updated", listener3);

    eventBus.publish("price.updated", "test-slab", { price: 42 });

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
    expect(listener3).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
    unsub3();
  });

  it("should include timestamp in event payload", () => {
    const listener = vi.fn();
    const unsubscribe = eventBus.subscribe("market.creating", listener);

    const before = Date.now();
    eventBus.publish("market.creating", "test-slab", {});
    const after = Date.now();

    expect(listener).toHaveBeenCalledTimes(1);
    const payload = listener.mock.calls[0][0] as EventPayload;

    expect(payload.timestamp).toBeGreaterThanOrEqual(before);
    expect(payload.timestamp).toBeLessThanOrEqual(after);

    unsubscribe();
  });

  it("should handle empty data object", () => {
    const listener = vi.fn();
    const unsubscribe = eventBus.subscribe("crank.failure", listener);

    eventBus.publish("crank.failure", "test-slab");

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "crank.failure",
        slabAddress: "test-slab",
        data: {},
      })
    );

    unsubscribe();
  });

  it("should not interfere with subscriptions to different events", () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();

    const unsub1 = eventBus.subscribe("liquidation.success", listener1);
    const unsub2 = eventBus.subscribe("liquidation.failure", listener2);

    eventBus.publish("liquidation.success", "slab-1", {});

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(0);

    eventBus.publish("liquidation.failure", "slab-2", {});

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);

    unsub1();
    unsub2();
  });
});
