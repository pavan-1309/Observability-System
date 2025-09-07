# Demo App Monitoring with Prometheus, Grafana, Loki, and Jaeger

## Objective
Build an integrated monitoring system that includes:
- Performance metrics
- Centralized logs
- Request tracing

## Tools Used
- **Prometheus** – metrics collection  
- **Grafana** – visualization dashboards  
- **Loki** – centralized logging  
- **Jaeger** – request tracing  
- **Docker Compose** – container orchestration  
- **Node.js** – demo application  

---

## Architecture Overview

```
[Demo App] ---> [Prometheus] ---> [Grafana]
       |
       v
      Logs ---> [Loki] ---> [Grafana]
       |
       v
    Traces ---> [Jaeger] ---> [Grafana]
```

- The Node.js app exposes `/metrics` for Prometheus scraping.
- Logs are written to a shared folder `/app/logs` which Promtail monitors.
- OpenTelemetry instrumented the Node.js app to export traces to Jaeger.

---

## Setup Steps

### 1. Clone repository
```bash
git clone <your-repo>
cd <project-folder>
```

### 2. Build and start Docker containers
```bash
docker-compose up -d --build
```

### 3. Verify containers
```bash
docker ps
```
You should see containers for:
- demo-app
- prometheus
- grafana
- loki
- promtail
- jaeger

### 4. Access services
| Service | URL |
|---------|-----|
| Demo App | http://localhost:3000 |
| Grafana | http://localhost:3001 |
| Prometheus | http://localhost:9090 |
| Jaeger | http://localhost:16686 |

---

## Prometheus Metrics
- `app_http_requests_total` – total requests  
- `app_http_request_duration_seconds` – request latency  
- `app_http_success_total` – successful requests  
- `app_http_error_total` – failed requests  

**Grafana Panels:**
1. **HTTP Requests per Second**  
   ```promql
   sum(rate(app_http_requests_total[1m])) by (route, status_code)
   ```
2. **Error Rate (%)**
   ```promql
   100 * (sum(rate(app_http_error_total[5m])) by (route)) / (sum(rate(app_http_requests_total[5m])) by (route))
   ```
3. **Success Rate (%)**
   ```promql
   100 * (sum(rate(app_http_success_total[5m])) by (route)) / (sum(rate(app_http_requests_total[5m])) by (route))
   ```
4. **95th Percentile Latency (s)**
   ```promql
   histogram_quantile(0.95, sum(rate(app_http_request_duration_seconds_bucket[5m])) by (le, route))
   ```

---

## Logging with Loki
- Application logs stored at `/app/logs/app.log`.
- Promtail reads logs and pushes to Loki.
- Use Grafana Explore to filter by labels like `job=demo-app`.

**Example Log Entry**
```json
{
  "method": "GET",
  "route": "/work",
  "status": 500,
  "duration_s": 0.213
}
```

---

## Tracing with Jaeger
- OpenTelemetry sends traces to Jaeger.
- Access Jaeger UI: http://localhost:16686
- Look for service: `demo-app`
- Observe operations like `/work`, `/error`  
- Spans show request duration and any errors.

---

## Observations
- Requests to `/work` simulate random failures ~10% of the time.  
- Error rate metrics reflect failures.  
- 95th percentile latency highlights slower requests.  
- Loki centralized logs make troubleshooting easier.  
- Jaeger traces help pinpoint where delays or errors occur in the app.

---

## Cleanup
```bash
docker-compose down -v
```
- Stops all containers and removes volumes.

---

## Deliverables
- `docker-compose.yml` – orchestrates all services  
- `prometheus.yml` – metrics scrape configuration  
- `promtail-config.yaml` – Loki log shipping configuration  
- `loki-config.yaml` – Loki storage configuration  
- `server.js` – demo Node.js application  
- `grafana-dashboard.json` – JSON for Grafana dashboards  
- `README.md` – this file  
- Sample logs and screenshots of traces in Jaeger

