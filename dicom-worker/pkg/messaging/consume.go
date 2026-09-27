package messaging

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
)

// Consume получает события и сохраняет позицию подписчика между перезапусками.
func (c *Client) Consume(
	ctx context.Context, subject, durable string, handle func(context.Context, []byte) error,
) error {
	_, err := c.js.AddConsumer(
		StreamName, &nats.ConsumerConfig{
			Durable:       durable,
			FilterSubject: subject,
			AckPolicy:     nats.AckExplicitPolicy,
			DeliverPolicy: nats.DeliverAllPolicy,
			AckWait:       time.Minute,
			MaxAckPending: 100,
		},
	)
	if err != nil {
		c.metrics.Counter("messaging.consume.error").Inc()
		return fmt.Errorf("ensure consumer %s: %w", durable, err)
	}

	sub, err := c.js.PullSubscribe(subject, durable, nats.Bind(StreamName, durable))
	if err != nil {
		c.metrics.Counter("messaging.consume.error").Inc()
		return err
	}
	defer sub.Unsubscribe()

	c.log.Info().Str("subject", subject).Str("durable", durable).Msg("NATS consumer started")
	defer c.log.Info().Str("subject", subject).Str("durable", durable).Msg("NATS consumer stopped")

	for ctx.Err() == nil {
		messages, err := sub.Fetch(1, nats.MaxWait(time.Second))
		if err != nil {
			if errors.Is(err, nats.ErrTimeout) {
				continue
			}
			c.metrics.Counter("messaging.consume.error").Inc()
			return fmt.Errorf("fetch %s: %w", durable, err)
		}

		for _, msg := range messages {
			c.metrics.Counter("messaging.consume.total").Inc()
			if metadata, err := msg.Metadata(); err == nil && metadata.NumDelivered > 1 {
				c.metrics.Counter("messaging.consume.redelivered").Inc()
			}

			workCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			err = handle(workCtx, msg.Data)
			cancel()
			if err != nil {
				c.metrics.Counter("messaging.consume.error").Inc()
			}

			var ackErr error
			switch {
			case err == nil:
				ackErr = msg.AckSync()
			case errors.Is(err, ErrPermanentMessage):
				c.metrics.Counter("messaging.consume.rejected").Inc()
				c.log.Error().Err(err).Str("subject", subject).Msg("message rejected")
				ackErr = msg.Term()
			default:
				c.metrics.Counter("messaging.consume.retry").Inc()
				c.log.Error().Err(err).Str("subject", subject).Msg("message will be retried")
				ackErr = msg.NakWithDelay(5 * time.Second)
			}

			if ackErr != nil {
				c.metrics.Counter("messaging.consume.ack_error").Inc()
				c.log.Error().Err(ackErr).Str("subject", subject).Msg("acknowledgement failed")
			} else if err == nil {
				c.metrics.Counter("messaging.consume.ok").Inc()
			}
		}
	}
	return nil
}
