#!/usr/bin/env bash
# Requires Ubuntu 22.04, 24.04, or compatible x64 workstation. Read-only Ubuntu snapshot.
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
  if [[ -f /proc/sys/kernel/random/uuid ]]; then
    COLLECTION_ID=$(cat /proc/sys/kernel/random/uuid)
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
if [[ ! -f /etc/os-release ]]; then
  echo "Relay collector requires a verified Ubuntu x64 workstation." >&2
  exit 1
fi

# shellcheck source=/dev/null
OS_ID=$(grep -E '^ID=' /etc/os-release | cut -d= -f2 | tr -d '"')
OS_VERSION=$(grep -E '^VERSION_ID=' /etc/os-release | cut -d= -f2 | tr -d '"')
ARCH=$(uname -m)

if [[ "$OS_ID" != "ubuntu" ]] || [[ "$ARCH" != "x86_64" ]]; then
  echo "Relay collector requires a verified Ubuntu x64 workstation." >&2
  exit 1
fi

# Execute read-only sampling via embedded Python 3 script
JSON_OUTPUT=$(python3 - "$COLLECTION_ID" "$OS_VERSION" "$INCLUDE_NETWORK" << 'PYEOF'
import sys
import os
import time
import glob
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

# 2. Memory collection from /proc/meminfo
memory_total_mb = None
memory_used_mb = None
try:
    with open('/proc/meminfo', 'r') as f:
        mem = {}
        for line in f:
            parts = line.split(':')
            if len(parts) == 2:
                mem[parts[0].strip()] = int(parts[1].strip().split()[0])
    if 'MemTotal' in mem and 'MemAvailable' in mem:
        total = (mem['MemTotal'] * 1024) / 1000000.0
        free = (mem['MemAvailable'] * 1024) / 1000000.0
        if total > 0 and free >= 0 and free <= total:
            memory_total_mb = round(total, 3)
            memory_used_mb = round(total - free, 3)
        else:
            add_error('memory', 'unavailable')
    else:
        add_error('memory', 'unavailable')
except Exception:
    add_error('memory', 'unavailable')

# 3. Disk collection from / (root filesystem)
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

# 4. Paired process CPU sampling
def read_processes():
    procs = {}
    for path in glob.glob('/proc/[0-9]*/stat'):
        try:
            with open(path, 'r') as f:
                content = f.read()
            lparen = content.find('(')
            rparen = content.rfind(')')
            if lparen == -1 or rparen == -1 or rparen <= lparen:
                continue
            pid = int(content[:lparen].strip())
            raw_name = content[lparen+1:rparen]
            # Sanitize process name: alphanumeric, space, dot, underscore, hyphen, parens
            safe_name = re.sub(r'[^a-zA-Z0-9 ._()-]', '_', raw_name).strip()
            if not safe_name:
                safe_name = 'unknown'
            safe_name = safe_name[:128]
            
            rest = content[rparen+2:].split()
            utime = int(rest[11])
            stime = int(rest[12])
            rss_pages = int(rest[21])
            procs[pid] = {
                'name': safe_name,
                'ticks': utime + stime,
                'rss_pages': rss_pages
            }
        except Exception:
            continue
    return procs

logical_processors = os.cpu_count() or 1
ticks_per_sec = os.sysconf('SC_CLK_TCK') if hasattr(os, 'sysconf') else 100
page_size = os.sysconf('SC_PAGE_SIZE') if hasattr(os, 'sysconf') else 4096

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
    if pid in before_procs:
        before = before_procs[pid]
        delta_ticks = after['ticks'] - before['ticks']
        if delta_ticks >= 0 and elapsed_seconds > 0 and logical_processors >= 1:
            raw_percent = (100.0 * delta_ticks) / (elapsed_seconds * ticks_per_sec * logical_processors)
            cpu_percent = round(min(100.0, max(0.0, raw_percent)), 3)
    
    memory_mb = round((after['rss_pages'] * page_size) / 1000000.0, 3)
    process_samples.append({
        'pid': pid,
        'name': after['name'],
        'cpuPercent': cpu_percent,
        'memoryMb': memory_mb
    })

# Sort top 20 processes by cpuPercent DESC (None last), memoryMb DESC, pid ASC
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
    'platform': 'ubuntu',
    'osVersion': os_version,
    'architecture': 'x64',
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

# Copy to clipboard automatically if pbcopy / xclip / wl-copy is available
if command -v pbcopy >/dev/null 2>&1; then
  printf '%s' "$JSON_OUTPUT" | pbcopy
  echo "[Relay] Telemetry automatically copied to your clipboard!" >&2
elif command -v wl-copy >/dev/null 2>&1; then
  printf '%s' "$JSON_OUTPUT" | wl-copy
  echo "[Relay] Telemetry automatically copied to your clipboard!" >&2
elif command -v xclip >/dev/null 2>&1; then
  printf '%s' "$JSON_OUTPUT" | xclip -selection clipboard
  echo "[Relay] Telemetry automatically copied to your clipboard!" >&2
fi

