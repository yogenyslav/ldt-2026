package metrics

import (
	"errors"
	"net/http"
	"sync"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/yogenyslav/errs"
)

var (
	// ErrRegisterBaseCollector ошибка, возникающая при неудачной регистрации базового коллектора.
	ErrRegisterBaseCollector = errors.New("failed to register base collector")
)

// Metrics клиент управления метриками.
type Metrics struct {
	mu      *sync.Mutex
	appName string

	counters map[string]prometheus.Counter
	gauges   map[string]prometheus.Gauge
	registry *prometheus.Registry
}

// New инициализация клиента работы с метриками.
func New(appName string) (*Metrics, error) {
	registry := prometheus.NewRegistry()

	baseCollectors := []prometheus.Collector{
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	}
	var err error
	for _, bc := range baseCollectors {
		err = registry.Register(bc)
		if err != nil {
			return nil, errs.Wrap(ErrRegisterBaseCollector, err.Error())
		}
	}

	return &Metrics{
		mu:       &sync.Mutex{},
		appName:  appName,
		counters: make(map[string]prometheus.Counter),
		gauges:   make(map[string]prometheus.Gauge),
		registry: registry,
	}, nil
}

// Counter создает или возвращает существующий счетчик с заданной меткой.
func (m *Metrics) Counter(label string) prometheus.Counter {
	m.mu.Lock()
	defer m.mu.Unlock()

	if counter, ok := m.counters[label]; ok {
		return counter
	}

	counter := prometheus.NewCounter(
		prometheus.CounterOpts{
			Namespace: m.appName,
			Name:      label,
		},
	)

	m.counters[label] = counter
	m.registry.MustRegister(counter)

	return counter
}

// Gauge создает или возвращает существующую плавающую метрику с заданной меткой.
func (m *Metrics) Gauge(label string) prometheus.Gauge {
	m.mu.Lock()
	defer m.mu.Unlock()

	if gauge, ok := m.gauges[label]; ok {
		return gauge
	}

	gauge := prometheus.NewGauge(
		prometheus.GaugeOpts{
			Namespace: m.appName,
			Name:      label,
		},
	)

	m.gauges[label] = gauge
	m.registry.MustRegister(gauge)

	return gauge
}

// Registry возвращает объект регистратора метрик.
func (m *Metrics) Registry() *prometheus.Registry {
	return m.registry
}

// Handler HTTP хендлер для метрик.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(
		m.registry,
		promhttp.HandlerOpts{},
	)
}
