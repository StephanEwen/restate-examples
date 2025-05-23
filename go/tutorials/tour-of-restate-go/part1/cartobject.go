package main

import restate "github.com/restatedev/sdk-go"

type CartObject struct{}

// <start_add_ticket>
func (CartObject) AddTicket(ctx restate.ObjectContext, ticketId string) (bool, error) {
	// !mark
	reservationSuccess, err := restate.Object[bool](ctx, "TicketObject", ticketId, "Reserve").Request(restate.Void{})
	if err != nil {
		return false, err
	}

	return reservationSuccess, nil
}

// <end_add_ticket>

// <start_checkout>
func (CartObject) Checkout(ctx restate.ObjectContext) (bool, error) {
	// !mark(1:2)
	success, err := restate.Service[bool](ctx, "CheckoutService", "Handle").
		Request(CheckoutRequest{UserId: restate.Key(ctx), Tickets: []string{"seat2B"}})
	if err != nil {
		return false, err
	}

	return success, nil
}

// <end_checkout>

// <start_expire_ticket>
func (CartObject) ExpireTicket(ctx restate.ObjectContext, ticketId string) error {
	// !mark
	restate.ObjectSend(ctx, "TicketObject", ticketId, "Unreserve").Send(restate.Void{})

	return nil
}

// <end_expire_ticket>
