# 📊 Monitoring & Observability Guide

Complete monitoring setup for MySmartNotes infrastructure and application performance.

## Table of Contents

1. [Metrics Collection](#metrics-collection)
2. [Logging](#logging)
3. [Tracing](#tracing)
4. [Alerting](#alerting)
5. [Dashboards](#dashboards)
6. [Performance Monitoring](#performance-monitoring)

---

## Metrics Collection

### Prometheus Setup

**docker-compose.monitoring.yml:**

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    volumes:
      - ./docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
    ports:
      - "9090:9090"
    networks:
      - monitoring_network
    restart: always

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    volumes:
      - grafana_data:/var/lib/grafana
      - ./docker/grafana/dashboards:/etc/grafana/provisioning/dashboards
      - ./docker/grafana/datasources:/etc/grafana/provisioning/datasources
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    ports:
      - "3000:3000"
    networks:
      - monitoring_network
    restart: always
    depends_on:
      - prometheus

  node_exporter:
    image: prom/node-exporter:latest
    container_name: node_exporter
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    ports:
      - "9100:9100"
    networks:
      - monitoring_network
    restart: always

  postgres_exporter:
    image: prometheuscommunity/postgres-exporter:latest
    container_name: postgres_exporter
    environment:
      - DATA_SOURCE_NAME=postgresql://user:password@postgres:5432/mysmartnotes?sslmode=disable
    ports:
      - "9187:9187"
    networks:
      - app_network
      - monitoring_network
    restart: always

  redis_exporter:
    image: oliver006/redis_exporter:latest
    container_name: redis_exporter
    environment:
      - REDIS_ADDR=redis:6379
      - REDIS_PASSWORD=${REDIS_PASSWORD}
    ports:
      - "9121:9121"
    networks:
      - app_network
      - monitoring_network
    restart: always

volumes:
  prometheus_data:
  grafana_data:

networks:
  monitoring_network:
    driver: bridge
  app_network:
    external: true
```

**Prometheus Configuration (docker/prometheus/prometheus.yml):**

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'mysmartnotes'
    environment: 'production'

scrape_configs:
  # Prometheus itself
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Node exporter (system metrics)
  - job_name: 'node'
    static_configs:
      - targets: ['node_exporter:9100']

  # PostgreSQL
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres_exporter:9187']

  # Redis
  - job_name: 'redis'
    static_configs:
      - targets: ['redis_exporter:9121']

  # API Gateway
  - job_name: 'api_gateway'
    static_configs:
      - targets: ['api_gateway:8000']
    metrics_path: '/metrics'

  # Celery workers
  - job_name: 'celery'
    static_configs:
      - targets: ['flower:5555']
    metrics_path: '/metrics'

  # Nginx
  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx:9113']

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - 'alerts.yml'
```

### Application Metrics

**Instrument FastAPI with Prometheus:**

```python
# services/api_gateway/main.py
from prometheus_client import Counter, Histogram, Gauge, generate_latest
from fastapi import FastAPI, Response
import time

app = FastAPI()

# Define metrics
REQUEST_COUNT = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

REQUEST_DURATION = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration',
    ['method', 'endpoint']
)

ACTIVE_USERS = Gauge(
    'active_users',
    'Number of active users'
)

TASK_QUEUE_SIZE = Gauge(
    'celery_task_queue_size',
    'Number of tasks in queue',
    ['queue']
)

TASK_PROCESSING_TIME = Histogram(
    'celery_task_duration_seconds',
    'Task processing time',
    ['task_name']
)

# Middleware to track metrics
@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start_time = time.time()
    
    response = await call_next(request)
    
    duration = time.time() - start_time
    
    REQUEST_COUNT.labels(
        method=request.method,
        endpoint=request.url.path,
        status=response.status_code
    ).inc()
    
    REQUEST_DURATION.labels(
        method=request.method,
        endpoint=request.url.path
    ).observe(duration)
    
    return response

# Metrics endpoint
@app.get("/metrics")
async def metrics():
    return Response(content=generate_latest(), media_type="text/plain")

# Update metrics in background
from apscheduler.schedulers.background import BackgroundScheduler

def update_metrics():
    # Update active users
    active_count = redis_client.scard("active_users")
    ACTIVE_USERS.set(active_count)
    
    # Update queue sizes
    from celery_app import celery_app
    inspect = celery_app.control.inspect()
    queues = inspect.active_queues()
    
    for worker, queue_list in (queues or {}).items():
        for queue_info in queue_list:
            queue_name = queue_info['name']
            size = len(celery_app.control.inspect().active().get(worker, []))
            TASK_QUEUE_SIZE.labels(queue=queue_name).set(size)

scheduler = BackgroundScheduler()
scheduler.add_job(update_metrics, 'interval', seconds=30)
scheduler.start()
```

**Celery Task Metrics:**

```python
# workers/celery_app.py
from celery import Celery
from celery.signals import task_prerun, task_postrun, task_failure
import time

celery_app = Celery('mysmartnotes')

# Track task execution time
task_start_times = {}

@task_prerun.connect
def task_prerun_handler(task_id, task, *args, **kwargs):
    task_start_times[task_id] = time.time()

@task_postrun.connect
def task_postrun_handler(task_id, task, *args, **kwargs):
    if task_id in task_start_times:
        duration = time.time() - task_start_times[task_id]
        TASK_PROCESSING_TIME.labels(task_name=task.name).observe(duration)
        del task_start_times[task_id]

@task_failure.connect
def task_failure_handler(task_id, exception, *args, **kwargs):
    TASK_FAILURES.labels(task_name=task.name).inc()
```

### Custom Business Metrics

```python
# Track business metrics
LECTURES_UPLOADED = Counter('lectures_uploaded_total', 'Total lectures uploaded')
QUESTIONS_ASKED = Counter('questions_asked_total', 'Total questions asked')
DOCUMENTS_GENERATED = Counter('documents_generated_total', 'Total documents generated', ['type'])
FLASHCARDS_CREATED = Counter('flashcards_created_total', 'Total flashcards created')

# Usage in routes
@router.post("/lectures/upload")
async def upload_lecture(...):
    # ... upload logic
    LECTURES_UPLOADED.inc()
    return response

@router.post("/chat")
async def ask_question(...):
    # ... chat logic
    QUESTIONS_ASKED.inc()
    return response

@router.post("/generate/{document_type}")
async def generate_document(document_type: str, ...):
    # ... generation logic
    DOCUMENTS_GENERATED.labels(type=document_type).inc()
    return response
```

---

## Logging

### Structured Logging Setup

```python
# services/api_gateway/utils/logger.py
import logging
import json
from datetime import datetime

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        }
        
        # Add exception info if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        # Add custom fields
        if hasattr(record, 'user_id'):
            log_data["user_id"] = record.user_id
        if hasattr(record, 'request_id'):
            log_data["request_id"] = record.request_id
        
        return json.dumps(log_data)

# Configure logging
def setup_logging():
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    
    # Console handler with JSON format
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(JSONFormatter())
    logger.addHandler(console_handler)
    
    # File handler with rotation
    from logging.handlers import RotatingFileHandler
    file_handler = RotatingFileHandler(
        '/var/log/mysmartnotes/app.log',
        maxBytes=10*1024*1024,  # 10MB
        backupCount=10
    )
    file_handler.setFormatter(JSONFormatter())
    logger.addHandler(file_handler)
    
    return logger

logger = setup_logging()
```

**Usage in Application:**

```python
# Add request context to logs
@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    
    logger.info(
        "Request started",
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "client_ip": request.client.host
        }
    )
    
    try:
        response = await call_next(request)
        
        logger.info(
            "Request completed",
            extra={
                "request_id": request_id,
                "status_code": response.status_code
            }
        )
        
        return response
    except Exception as e:
        logger.error(
            "Request failed",
            extra={"request_id": request_id},
            exc_info=True
        )
        raise

# Log in routes
@router.post("/lectures/upload")
async def upload_lecture(
    file: UploadFile,
    request: Request,
    current_user: User = Depends(get_current_user)
):
    logger.info(
        "Lecture upload started",
        extra={
            "request_id": request.state.request_id,
            "user_id": current_user.id,
            "filename": file.filename
        }
    )
    
    try:
        # ... upload logic
        
        logger.info(
            "Lecture uploaded successfully",
            extra={
                "request_id": request.state.request_id,
                "user_id": current_user.id,
                "lecture_id": lecture.id
            }
        )
        
        return {"lecture_id": lecture.id}
    except Exception as e:
        logger.error(
            "Lecture upload failed",
            extra={
                "request_id": request.state.request_id,
                "user_id": current_user.id
            },
            exc_info=True
        )
        raise
```

### Log Aggregation with ELK Stack

**docker-compose.logging.yml:**

```yaml
version: '3.8'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    container_name: elasticsearch
    environment:
      - discovery.type=single-node
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
      - xpack.security.enabled=false
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    ports:
      - "9200:9200"
    networks:
      - logging_network

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    container_name: logstash
    volumes:
      - ./docker/logstash/logstash.conf:/usr/share/logstash/pipeline/logstash.conf
    ports:
      - "5000:5000"
    networks:
      - logging_network
    depends_on:
      - elasticsearch

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    container_name: kibana
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    ports:
      - "5601:5601"
    networks:
      - logging_network
    depends_on:
      - elasticsearch

volumes:
  elasticsearch_data:

networks:
  logging_network:
    driver: bridge
```

**Logstash Configuration (docker/logstash/logstash.conf):**

```
input {
  tcp {
    port => 5000
    codec => json
  }
}

filter {
  # Parse JSON logs
  json {
    source => "message"
  }
  
  # Add geoip for client IPs
  geoip {
    source => "client_ip"
  }
  
  # Extract response time if present
  if [duration] {
    mutate {
      convert => { "duration" => "float" }
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "mysmartnotes-logs-%{+YYYY.MM.dd}"
  }
  
  # Also output to stdout for debugging
  stdout {
    codec => rubydebug
  }
}
```

**Send logs to Logstash:**

```python
# Add Logstash handler to logger
from logging.handlers import SocketHandler

logstash_handler = SocketHandler('logstash', 5000)
logstash_handler.setFormatter(JSONFormatter())
logger.addHandler(logstash_handler)
```

---

## Tracing

### OpenTelemetry Setup

```python
# services/api_gateway/tracing.py
from opentelemetry import trace
from opentelemetry.exporter.jaeger.thrift import JaegerExporter
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor

def setup_tracing(app: FastAPI):
    # Configure tracer
    resource = Resource(attributes={
        SERVICE_NAME: "api-gateway"
    })
    
    provider = TracerProvider(resource=resource)
    processor = BatchSpanProcessor(
        JaegerExporter(
            agent_host_name="jaeger",
            agent_port=6831
        )
    )
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)
    
    # Instrument FastAPI
    FastAPIInstrumentor.instrument_app(app)
    
    # Instrument database
    SQLAlchemyInstrumentor().instrument(engine=engine)
    
    # Instrument Redis
    RedisInstrumentor().instrument()

# main.py
app = FastAPI()
setup_tracing(app)

# Manual tracing
tracer = trace.get_tracer(__name__)

@router.post("/lectures/process")
async def process_lecture(lecture_id: int):
    with tracer.start_as_current_span("process_lecture") as span:
        span.set_attribute("lecture_id", lecture_id)
        
        # Extract text
        with tracer.start_as_current_span("ocr_extraction"):
            text = await extract_text(lecture_id)
        
        # Generate embeddings
        with tracer.start_as_current_span("generate_embeddings"):
            embeddings = await generate_embeddings(text)
        
        # Store in vector DB
        with tracer.start_as_current_span("store_embeddings"):
            await store_embeddings(embeddings)
        
        return {"status": "processed"}
```

**Jaeger Setup:**

```yaml
# docker-compose.monitoring.yml
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    container_name: jaeger
    environment:
      - COLLECTOR_ZIPKIN_HOST_PORT=:9411
    ports:
      - "5775:5775/udp"
      - "6831:6831/udp"
      - "6832:6832/udp"
      - "5778:5778"
      - "16686:16686"  # Jaeger UI
      - "14268:14268"
      - "14250:14250"
      - "9411:9411"
    networks:
      - monitoring_network
```

---

## Alerting

### Prometheus Alert Rules

**docker/prometheus/alerts.yml:**

```yaml
groups:
  - name: api_alerts
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }} errors/second"

      # High response time
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time"
          description: "95th percentile response time is {{ $value }}s"

      # Service down
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"

  - name: database_alerts
    interval: 30s
    rules:
      # High connection count
      - alert: PostgresHighConnections
        expr: pg_stat_database_numbackends > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "PostgreSQL connection count is high"
          description: "{{ $value }} connections active"

      # Database disk usage
      - alert: DatabaseDiskFull
        expr: (node_filesystem_avail_bytes{mountpoint="/var/lib/postgresql"} / node_filesystem_size_bytes) < 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Database disk usage critical"
          description: "Only {{ $value | humanizePercentage }} space remaining"

  - name: celery_alerts
    interval: 30s
    rules:
      # Task queue backup
      - alert: CeleryQueueBackup
        expr: celery_task_queue_size > 100
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Celery queue {{ $labels.queue }} has backlog"
          description: "{{ $value }} tasks pending"

      # Task failure rate
      - alert: HighTaskFailureRate
        expr: rate(celery_task_failures_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High task failure rate"
          description: "{{ $value }} failures/second"

  - name: system_alerts
    interval: 30s
    rules:
      # High CPU usage
      - alert: HighCPUUsage
        expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage"
          description: "CPU usage is {{ $value }}%"

      # High memory usage
      - alert: HighMemoryUsage
        expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100 > 85
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}%"

      # Disk space low
      - alert: DiskSpaceLow
        expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100 < 15
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Low disk space on {{ $labels.mountpoint }}"
          description: "Only {{ $value }}% space remaining"
```

### Alertmanager Configuration

**docker/prometheus/alertmanager.yml:**

```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'
  routes:
    - match:
        severity: critical
      receiver: 'critical'
      continue: true
    
    - match:
        severity: warning
      receiver: 'warning'

receivers:
  - name: 'default'
    email_configs:
      - to: 'alerts@yourdomain.com'
        from: 'prometheus@yourdomain.com'
        smarthost: 'smtp.gmail.com:587'
        auth_username: 'your-email@gmail.com'
        auth_password: 'your-app-password'

  - name: 'critical'
    email_configs:
      - to: 'oncall@yourdomain.com'
        from: 'prometheus@yourdomain.com'
        smarthost: 'smtp.gmail.com:587'
        auth_username: 'your-email@gmail.com'
        auth_password: 'your-app-password'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#alerts-critical'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

  - name: 'warning'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#alerts-warning'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'cluster', 'service']
```

---

## Dashboards

### Grafana Datasource Configuration

**docker/grafana/datasources/prometheus.yml:**

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

### System Overview Dashboard

**docker/grafana/dashboards/system.json** (excerpt):

```json
{
  "dashboard": {
    "title": "System Overview",
    "panels": [
      {
        "title": "CPU Usage",
        "targets": [
          {
            "expr": "100 - (avg by(instance) (rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)"
          }
        ],
        "type": "graph"
      },
      {
        "title": "Memory Usage",
        "targets": [
          {
            "expr": "(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100"
          }
        ],
        "type": "gauge"
      },
      {
        "title": "Disk Usage",
        "targets": [
          {
            "expr": "100 - ((node_filesystem_avail_bytes{mountpoint=\"/\"} / node_filesystem_size_bytes{mountpoint=\"/\"}) * 100)"
          }
        ],
        "type": "gauge"
      },
      {
        "title": "Network Traffic",
        "targets": [
          {
            "expr": "rate(node_network_receive_bytes_total[5m])",
            "legendFormat": "Inbound"
          },
          {
            "expr": "rate(node_network_transmit_bytes_total[5m])",
            "legendFormat": "Outbound"
          }
        ],
        "type": "graph"
      }
    ]
  }
}
```

### Application Dashboard

Key panels:
- **Request Rate**: `rate(http_requests_total[5m])`
- **Error Rate**: `rate(http_requests_total{status=~"5.."}[5m])`
- **Response Time (p95)**: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))`
- **Active Users**: `active_users`
- **Task Queue Size**: `celery_task_queue_size`
- **Database Connections**: `pg_stat_database_numbackends`

---

## Performance Monitoring

### APM with Elastic APM

```python
# services/api_gateway/main.py
from elasticapm.contrib.starlette import ElasticAPM, make_apm_client

apm_config = {
    'SERVICE_NAME': 'api-gateway',
    'SERVER_URL': 'http://apm-server:8200',
    'ENVIRONMENT': 'production',
}

apm_client = make_apm_client(apm_config)
app.add_middleware(ElasticAPM, client=apm_client)
```

### Database Query Performance

```python
# Log slow queries
@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    conn.info.setdefault('query_start_time', []).append(time.time())

@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    total = time.time() - conn.info['query_start_time'].pop()
    if total > 1.0:  # Log queries > 1 second
        logger.warning(f"Slow query ({total:.2f}s): {statement[:200]}")
```

---

For deployment details, see [DEPLOYMENT.md](DEPLOYMENT.md).  
For security monitoring, see [SECURITY.md](SECURITY.md).
