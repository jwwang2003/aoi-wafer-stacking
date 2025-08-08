#!/bin/bash

# Exit immediately on error
set -e

OUTPUT_FILE=""
NO_CAPTURE=false
ARGS=()

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out)
      shift
      OUTPUT_FILE="$1"
      ;;
    --nocapture)
      NO_CAPTURE=true
      ;;
    *)
      ARGS+=("$1")
      ;;
  esac
  shift
done

# If no tests specified, run all
if [ ${#ARGS[@]} -eq 0 ]; then
  TESTS_TO_RUN=("all")
else
  TESTS_TO_RUN=("${ARGS[@]}")
fi

# Build cargo test extra args
CARGO_ARGS=()
if $NO_CAPTURE; then
  CARGO_ARGS+=("--" "--nocapture")
fi

# Function to run a test and optionally pipe to file
run_test() {
  local name="$1"
  if [[ "$name" == "all" ]]; then
    echo "=== Running all tests ==="
    if [[ -n "$OUTPUT_FILE" ]]; then
      cargo test "${CARGO_ARGS[@]}" | tee -a "$OUTPUT_FILE"
    else
      cargo test "${CARGO_ARGS[@]}"
    fi
  else
    echo "=== Running $name ==="
    if [[ -n "$OUTPUT_FILE" ]]; then
      cargo test "$name" "${CARGO_ARGS[@]}" | tee -a "$OUTPUT_FILE"
    else
      cargo test "$name" "${CARGO_ARGS[@]}"
    fi
  fi
}

# Run requested tests
for t in "${TESTS_TO_RUN[@]}"; do
  run_test "$t"
done
