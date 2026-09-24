FROM golang:1.27.1-alpine AS builder
WORKDIR /builder

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o ./service ./cmd/service/main.go
RUN CGO_ENABLED=0 GOOS=linux go build -o ./poller ./cmd/poller/main.go

FROM alpine:3.24 AS prod
WORKDIR /prod

COPY --from=builder /builder/service ./service
COPY --from=builder /builder/poller ./poller

CMD [ "./service" ]
