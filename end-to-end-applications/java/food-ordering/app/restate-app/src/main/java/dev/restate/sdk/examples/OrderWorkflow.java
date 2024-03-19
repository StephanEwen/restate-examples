/*
 * Copyright (c) 2024 - Restate Software, Inc., Restate GmbH
 *
 * This file is part of the Restate examples,
 * which is released under the MIT license.
 *
 * You can find a copy of the license in the file LICENSE
 * in the root directory of this repository or package or at
 * https://github.com/restatedev/examples/
 */

package dev.restate.sdk.examples;

import static dev.restate.sdk.examples.utils.TypeUtils.statusToProto;

import dev.restate.sdk.ObjectContext;
import dev.restate.sdk.common.CoreSerdes;
import dev.restate.sdk.common.TerminalException;
import dev.restate.sdk.examples.clients.PaymentClient;
import dev.restate.sdk.examples.clients.RestaurantClient;
import dev.restate.sdk.examples.generated.DeliveryManagerRestate;
import dev.restate.sdk.examples.generated.OrderProto.*;
import dev.restate.sdk.examples.generated.OrderStatusServiceRestate;
import dev.restate.sdk.examples.generated.OrderWorkflowRestate;
import dev.restate.sdk.examples.types.OrderRequest;
import dev.restate.sdk.examples.types.StatusEnum;
import dev.restate.sdk.examples.utils.Json;

import java.time.Duration;
import java.util.UUID;

/**
 * Order processing workflow Gets called for each Kafka event that is published to the order topic.
 * The event contains the order ID and the raw JSON order. The workflow handles the payment, asks
 * the restaurant to start the preparation, and triggers the delivery.
 */
public class OrderWorkflow extends OrderWorkflowRestate.OrderWorkflowRestateImplBase {
  private final RestaurantClient restaurant = RestaurantClient.get();
  private final PaymentClient paymentClnt = PaymentClient.get();

  @Override
  public void handleOrderCreationEvent(ObjectContext ctx, KafkaOrderEvent event)
      throws TerminalException {
    var statusServiceClient = OrderStatusServiceRestate.newClient(ctx);

    OrderRequest order = Json.readOrder(event.getPayload().toStringUtf8());
    String id = order.getOrderId();

    // 1. Set status
    statusServiceClient.setStatus(statusToProto(id, StatusEnum.CREATED));

    // 2. Handle payment
    String token = ctx.sideEffect(CoreSerdes.JSON_STRING, () -> UUID.randomUUID().toString());
    boolean paid =
        ctx.sideEffect(
            CoreSerdes.JSON_BOOLEAN, () -> paymentClnt.charge(id, token, order.getTotalCost()));

    if (!paid) {
      statusServiceClient.setStatus(statusToProto(id, StatusEnum.REJECTED));
      return;
    }

    // 3. Schedule preparation
    statusServiceClient.setStatus(statusToProto(order.getOrderId(), StatusEnum.SCHEDULED));
    ctx.sleep(Duration.ofMillis(order.getDeliveryDelay()));

    // 4. Trigger preparation
    var preparationAwakeable = ctx.awakeable(CoreSerdes.VOID);
    ctx.sideEffect(() -> restaurant.prepare(id, preparationAwakeable.id()));
    statusServiceClient.setStatus(statusToProto(id, StatusEnum.IN_PREPARATION));

    preparationAwakeable.await();
    statusServiceClient.setStatus(statusToProto(id, StatusEnum.SCHEDULING_DELIVERY));

    // 5. Find a driver and start delivery
    var deliveryAwakeable = ctx.awakeable(CoreSerdes.VOID);

    var deliveryRequest =
        DeliveryRequest.newBuilder()
            .setOrderId(id)
            .setRestaurantId(order.getRestaurantId())
            .setCallback(deliveryAwakeable.id())
            .build();
    DeliveryManagerRestate.newClient(ctx).oneWay().start(deliveryRequest);
    deliveryAwakeable.await();
    statusServiceClient.setStatus(statusToProto(order.getOrderId(), StatusEnum.DELIVERED));
  }
}
