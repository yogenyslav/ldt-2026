package messaging

import (
	"context"

	"github.com/nats-io/nats.go"
)

// Publish отправляет событие и ожидает подтверждения сохранения в JetStream.
func (c *Client) Publish(ctx context.Context, subject, eventID string, payload []byte) error {
	c.metrics.Counter("messaging.publish.total").Inc()

	message := nats.NewMsg(subject)
	message.Data = payload
	message.Header.Set(nats.MsgIdHdr, eventID)

	_, err := c.js.PublishMsg(message, nats.Context(ctx))
	if err != nil {
		c.metrics.Counter("messaging.publish.error").Inc()
		c.log.Error().Err(err).Str("subject", subject).Str("event_id", eventID).Msg("NATS publication failed")
		return err
	}

	c.metrics.Counter("messaging.publish.ok").Inc()
	return nil
}
