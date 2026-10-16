#!/usr/bin/env bash
# Requires macOS 15+ on Apple Silicon (arm64). Read-only macOS snapshot.
# MB and GB mean decimal bytes/1e6 and bytes/1e9. Process CPU readings use
# paired samples, not cumulative process CPU time or proof of a cause.
# Review the local JSON before sharing: even bounded process names can be private.
set -euo pipefail

COLLECTION_ID=""
INCLUDE_NETWORK=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --collection-id|-c)
      COLLECTION_ID="$2"
      shift 2
      ;;
    --include-network)
      INCLUDE_NETWORK=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

# If no collection ID provided, generate a random UUID
if [[ -z "$COLLECTION_ID" ]]; then
  if command -v uuidgen >/dev/null 2>&1; then
    COLLECTION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  else
    COLLECTION_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
  fi
fi

# Validate CollectionId UUID format
UUID_REGEX='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
if [[ ! "$COLLECTION_ID" =~ $UUID_REGEX ]]; then
  echo "Invalid collection-id: must be a valid UUID." >&2
  exit 1
fi

# Verify operating system and architecture
OS_NAME=$(uname -s 2>/dev/null || echo "unknown")
ARCH=$(uname -m 2>/dev/null || echo "unknown")

if [[ "$OS_NAME" != "Darwin" ]] || [[ "$ARCH" != "arm64" ]]; then
  echo "Relay collector requires a verified macOS on Apple Silicon (arm64) workstation." >&2
  exit 1
fi

OS_VERSION=$(sw_vers -productVersion 2>/dev/null || echo "15.0")

# Execute read-only sampling via embedded Python 3 script
JSON_OUTPUT=$(python3 - "$COLLECTION_ID" "$OS_VERSION" "$INCLUDE_NETWORK" << 'PYEOF'
import sys
import os
import time
import subprocess
import re
import json
from datetime import datetime, timezone

collection_id = sys.argv[1].lower()
os_version = sys.argv[2]
include_network = sys.argv[3] == "true"

errors = []

def add_error(check_id, code):
    if len(errors) < 32:
        for e in errors:
            if e['checkId'] == check_id and e['code'] == code:
                return
        errors.append({'checkId': check_id, 'code': code})

# 1. Uncollected fields
add_error('machine-cpu-not-collected', 'unavailable')
add_error('dns-not-collected', 'unsupported')
add_error('gateway-not-collected', 'unsupported')
add_error('event-excerpts-not-collected', 'unavailable')

if include_network:
    add_error('network-probes-not-implemented', 'unsupported')

# 2. Memory collection via sysctl and vm_stat
memory_total_mb = None
memory_used_mb = None
try:
    total_bytes = int(subprocess.check_output(['sysctl', '-n', 'hw.memsize'], timeout=3).strip())
    vm_out = subprocess.check_output(['vm_stat'], timeout=3).decode('utf8', errors='ignore')
    
    # vm_stat page size
    page_size = 16384
    m_page = re.search(r'page size of (\d+) bytes', vm_out)
    if m_page:
        page_size = int(m_page.group(1))
    
    pages_free = 0
    pages_spec = 0
    for line in vm_out.splitlines():
        if 'Pages free:' in line:
            pages_free = int(re.sub(r'[^0-9]', '', line.split(':')[1]))
        elif 'Pages speculative:' in line:
            pages_spec = int(re.sub(r'[^0-9]', '', line.split(':')[1]))
            
    free_bytes = (pages_free + pages_spec) * page_size
    total_mb = total_bytes / 1000000.0
    free_mb = free_bytes / 1000000.0
    
    if total_mb > 0 and free_mb >= 0 and free_mb <= total_mb:
        memory_total_mb = round(total_mb, 3)
        memory_used_mb = round(total_mb - free_mb, 3)
    else:
        add_error('memory', 'unavailable')
except Exception:
    add_error('memory', 'unavailable')

# 3. Disk collection via statvfs on /
disk_total_gb = None
disk_free_gb = None
try:
    st = os.statvfs('/')
    total = (st.f_blocks * st.f_frsize) / 1000000000.0
    free = (st.f_bavail * st.f_frsize) / 1000000000.0
    if total > 0 and free >= 0 and free <= total:
        disk_total_gb = round(total, 3)
        disk_free_gb = round(free, 3)
    else:
        add_error('system-drive', 'unavailable')
except Exception:
    add_error('system-drive', 'unavailable')

# 4. Paired process CPU sampling using ps
def parse_cputime_to_seconds(t_str):
    # Formats: mm:ss.ss or hh:mm:ss or dd-hh:mm:ss
    try:
        days = 0
        if '-' in t_str:
            parts_d = t_str.split('-')
            days = int(parts_d[0])
            t_str = parts_d[1]
        parts = t_str.split(':')
        if len(parts) == 2:
            return days * 86400.0 + int(parts[0]) * 60.0 + float(parts[1])
        elif len(parts) == 3:
            return days * 86400.0 + int(parts[0]) * 3600.0 + int(parts[1]) * 60.0 + float(parts[2])
    except Exception:
        pass
    return None

def read_processes():
    procs = {}
    try:
        out = subprocess.check_output(
            ['ps', '-A', '-o', 'pid=,cputime=,rss=,comm='],
            timeout=5
        ).decode('utf8', errors='ignore')
        
        for line in out.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split(None, 3)
            if len(parts) < 4:
                continue
            pid_str, cputime_str, rss_str, comm_raw = parts
            pid = int(pid_str)
            sec = parse_cputime_to_seconds(cputime_str)
            rss_kb = int(rss_str)
            
            # Sanitize process name: basename only, clean characters
            base_comm = os.path.basename(comm_raw)
            safe_name = re.sub(r'[^a-zA-Z0-9 ._()-]', '_', base_comm).strip()
            if not safe_name:
                safe_name = 'unknown'
            safe_name = safe_name[:128]
            
            procs[pid] = {
                'name': safe_name,
                'cpuSeconds': sec,
                'memoryMb': round((rss_kb * 1024) / 1000000.0, 3)
            }
    except Exception:
        pass
    return procs

logical_processors = os.cpu_count() or 1

t_start = time.perf_counter()
before_procs = read_processes()
time.sleep(1.0)
t_end = time.perf_counter()
after_procs = read_processes()

elapsed_seconds = t_end - t_start
sample_interval_ms = round(elapsed_seconds * 1000.0, 3)

process_samples = []
for pid, after in after_procs.items():
    cpu_percent = None
    if pid in before_procs and after['cpuSeconds'] is not None and before_procs[pid]['cpuSeconds'] is not None:
        delta_sec = after['cpuSeconds'] - before_procs[pid]['cpuSeconds']
        if delta_sec >= 0 and elapsed_seconds > 0 and logical_processors >= 1:
            raw_percent = (100.0 * delta_sec) / (elapsed_seconds * logical_processors)
            cpu_percent = round(min(100.0, max(0.0, raw_percent)), 3)
            
    process_samples.append({
        'pid': pid,
        'name': after['name'],
        'cpuPercent': cpu_percent,
        'memoryMb': after['memoryMb']
    })

# Sort top 20 processes by cpuPercent DESC, memoryMb DESC, pid ASC
process_samples.sort(
    key=lambda p: (
        p['cpuPercent'] if p['cpuPercent'] is not None else -1.0,
        p['memoryMb'] if p['memoryMb'] is not None else -1.0,
        -p['pid']
    ),
    reverse=True
)
top_processes = process_samples[:20]

snapshot = {
    'schemaVersion': 1,
    'collectionId': collection_id,
    'platform': 'macos',
    'osVersion': os_version,
    'architecture': 'arm64',
    'source': 'collector',
    'collectorVersion': '1.0.0',
    'collectedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    'sampleIntervalMs': sample_interval_ms,
    'cpuPercent': None,
    'memoryTotalMb': memory_total_mb,
    'memoryUsedMb': memory_used_mb,
    'diskTotalGb': disk_total_gb,
    'diskFreeGb': disk_free_gb,
    'dnsResolved': None,
    'gatewayLatencyMs': None,
    'processes': top_processes,
    'eventExcerpts': [],
    'errors': errors
}

print(json.dumps(snapshot, separators=(',', ':')))
PYEOF
)

printf '%s\n' "$JSON_OUTPUT"

# Copy to clipboard automatically if pbcopy is available
if command -v pbcopy >/dev/null 2>&1; then
  printf '%s' "$JSON_OUTPUT" | pbcopy
  echo "[Relay] Telemetry automatically copied to your clipboard!" >&2
fi

