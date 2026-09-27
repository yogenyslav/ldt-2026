FROM golang:1.27.1-alpine AS builder
WORKDIR /builder

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o ./service ./cmd/service/main.go
RUN CGO_ENABLED=0 GOOS=linux go build -o ./outbox ./cmd/outbox/main.go

RUN CGO_ENABLED=0 GOOS=linux go build -o ./result_listener ./cmd/result_listener

FROM alpine:3.24 AS prod
WORKDIR /prod

COPY --from=builder /builder/service ./service
COPY --from=builder /builder/outbox ./outbox

COPY --from=builder /builder/result_listener ./result_listener

CMD [ "./service" ]
