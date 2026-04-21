#!/usr/bin/env bash
set -euo pipefail

load_env_file() {
  local env_file="${1:-}"

  if [[ -z "${env_file}" || ! -f "${env_file}" ]]; then
    echo "Env file is missing: ${env_file}" >&2
    return 1
  fi

  while IFS= read -r line || [[ -n "${line}" ]]; do
    [[ -z "${line}" ]] && continue
    [[ "${line}" =~ ^[[:space:]]*# ]] && continue

    local key="${line%%=*}"
    local value="${line#*=}"

    key="$(printf '%s' "${key}" | xargs)"
    [[ -z "${key}" ]] && continue

    if [[ "${value}" =~ ^\".*\"$ || "${value}" =~ ^\'.*\'$ ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "${key}=${value}"
  done < "${env_file}"
}
