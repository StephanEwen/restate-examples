package my.example.sagas;

import dev.restate.common.function.ThrowingRunnable;
import dev.restate.sdk.WorkflowContext;
import dev.restate.sdk.annotation.Workflow;
import dev.restate.sdk.common.TerminalException;
import dev.restate.sdk.endpoint.Endpoint;
import dev.restate.sdk.http.vertx.RestateHttpServer;
import my.example.sagas.activities.*;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/*
Trip reservation workflow using sagas:
Restate infinitely retries failures, and recovers previous progress.
But for some types of failures (terminal exceptions), we don't want to retry but want to undo the previous actions and finish.

Restate guarantees the execution of your code. This makes it very easy to implement sagas.
We execute actions, and keep track of a list of undo actions.
When a terminal exception occurs, Restate ensures execution of all compensations.

+------ Initialize compensations list ------+
                     |
                     v
+------------------ Try --------------------+
| 1. Reserve Flights & Register Undo        |
| 2. Reserve Car & Register Undo            |
| 3. Generate Payment ID & Register Refund  |
| 4. Perform Payment                        |
| 5. Confirm Flight Reservation             |
| 6. Confirm Car Reservation                |
+------------------ Catch ------------------+
| If TerminalException:                         |
|   Execute compensations in reverse order  |
| Rethrow error                             |
+--------------------------------------------+

Note: that the compensation logic is purely implemented in user code (no special Restate API)
 */
@Workflow
public class BookingWorkflowSteps {

  private static final Logger logger = LogManager.getLogger(BookingWorkflowSteps.class);

  public record BookingRequest(
          FlightService.FlightBookingRequest flights,
          CarRentalService.CarRentalRequest car,
          PaymentClient.PaymentInfo paymentInfo
  ) {}

  @Workflow
  public void run(WorkflowContext ctx, BookingRequest req) throws TerminalException {
    // Create a list of undo actions
    List<ThrowingRunnable> compensations = new ArrayList<>();

    try {
      //  -------------
      //  Step (1) - Reserve the flights; Restate remembers the reservation ID
      //  -------------

      // ctx.run(...) records the result of a function as a durable step.
      // completed steps are not re-executed during recovery, but their results are
      // restored from a journal
      final String flightBookingId = ctx.run(String.class, () -> {
        String bookingId = UUID.randomUUID().toString();

        // make the call to the flight booking API here
        logger.info("Flight reservation created with id: {}", bookingId);
        return bookingId;
      });
      compensations.add(() -> {
        logger.info("Flight reservation confirmed with id: {}", flightBookingId);
      });

      //  -------------
      //  Step (2) - Reserve the flights; Restate remembers the reservation ID
      //  -------------

      final String carBookingId = ctx.run(String.class, () -> {
        String bookingId = UUID.randomUUID().toString();

        // make the call to the car booking API (reserve) here
        logger.info("Car rental reservation created with id: {}", bookingId);
        return bookingId;
      });
      compensations.add(() -> {
        logger.info("Car rental reservation cancelled with id: {}", carBookingId);
      });

      //  -------------
      //  Step (3) - Payment - In this demo, payments spuriously fail to trigger compensations
      //  -------------

      // Charge the payment; Generate a payment ID and store it in Restate
      String paymentId = ctx.random().nextUUID().toString();
      // Register the refund as a compensation, using the idempotency key
      compensations.add(() -> PaymentClient.refund(paymentId));
      // Do the payment using the paymentId as idempotency key
      ctx.run(() -> PaymentClient.charge(req.paymentInfo(), paymentId));

      //  -------------
      //  Step (4) - Confirm the flight and car reservations
      //  -------------

      ctx.run(() -> {
        // make the call to the flight booking API (confirm) here
        logger.info("Flight reservation confirmed with id: {}", carBookingId);
      });
      ctx.run(() -> {
        // make the call to the car booking API (confirm) here
        logger.info("Car rental reservation confirmed with id: {}", carBookingId);
      });
    }
    // Terminal errors tell Restate not to retry, but to compensate and fail the workflow
    catch (TerminalException e) {
      // Undo all the steps up to this point by running the compensations
      // Restate guarantees that all compensations are executed
      for (ThrowingRunnable compensation : compensations) {
        ctx.run(compensation);
      }

      // Rethrow error to fail this workflow
      throw e;
    }
  }

  public static void main(String[] args) {
    RestateHttpServer.listen(
      Endpoint.bind(new BookingWorkflowSteps())
    );
  }
}
