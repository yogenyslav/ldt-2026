package orthanc

import (
	"net/http"
	"time"
)

const (
	retryAttempts = 5
	retryDelay    = 100 * time.Millisecond
)

type retryClient struct {
	client interface {
		Do(*http.Request) (*http.Response, error)
	}
}

func (c *retryClient) Do(req *http.Request) (*http.Response, error) {
	// Only replay reads without bodies; writes may have already succeeded.
	if (req.Method != http.MethodGet && req.Method != http.MethodHead) ||
		(req.Body != nil && req.Body != http.NoBody) {
		return c.client.Do(req)
	}

	for attempt := 0; ; attempt++ {
		if err := req.Context().Err(); err != nil {
			return nil, err
		}
		resp, err := c.client.Do(req.Clone(req.Context()))
		if attempt == retryAttempts-1 || (err == nil && !retryStatus(resp.StatusCode)) {
			return resp, err
		}
		if resp != nil && resp.Body != nil {
			resp.Body.Close()
		}

		timer := time.NewTimer(retryDelay << attempt)
		select {
		case <-req.Context().Done():
			timer.Stop()
			return nil, req.Context().Err()
		case <-timer.C:
		}
	}
}

func retryStatus(status int) bool {
	return status == http.StatusNotFound || status == http.StatusRequestTimeout ||
		status == http.StatusTooManyRequests || (status >= 500 && status <= 599)
}
