#!/usr/bin/env bash
# Single entrypoint to run every TargetForge benchmark harness in
# benchmark/docking/scripts/ inside the pinned container (benchmark/Dockerfile),
# writing all JSON results, data artifacts, and Markdown reports directly back
# into the mounted repository.
#
# Usage:
#   ./run-benchmarks.sh                    Run all 14 harnesses in dependency order
#   ./run-benchmarks.sh --check            Verify pinned toolchain & Task 6 prereqs
#   ./run-benchmarks.sh --list             List all harnesses in execution order
#   ./run-benchmarks.sh --only <name>      Run a single group (node|python) or script
#   ./run-benchmarks.sh --only run_vina_vs_tanimoto.py -- --target egfr --limit 10
#   ./run-benchmarks.sh --build-only       Build the container image and exit
#   ./run-benchmarks.sh --rebuild          Force container image rebuild before running
#   ./run-benchmarks.sh --local            Run directly on the current host (no Docker)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE_NAME="${TARGETFORGE_BENCHMARK_IMAGE:-targetforge-benchmarks:pinned}"
DOCKERFILE="${REPO_ROOT}/benchmark/Dockerfile"
SCRIPTS_DIR="benchmark/docking/scripts"

# Ordered list of every executable harness in benchmark/docking/scripts/.
# Dependency invariants:
#   - evaluate_rankers.mjs       -> writes task1_four_rankers.json (read by build_task2_benchmark.mjs)
#   - build_task2_benchmark.mjs  -> writes task2_scaffold_property_matched_benchmark.json (read by run_vina_vs_tanimoto.py)
#   - validate_novelty_retrospective.mjs -> writes/uses task3 snapshot (read by Tasks 4, 7, 8, 10)
#   - build_target_features.mjs  -> writes task8_target_features.json.gz (read by tractability_models.mjs & repurposing_validation.mjs)
#   - run_25_drug_benchmark.py   -> writes approved_25.json (read by validate_25_pairs.py)
#   - run_redock_multiseed.py, run_25_drug_benchmark.py, validate_25_pairs.py, run_enrichment.py
#                                -> all read by generate_results_md.py
NODE_HARNESSES=(
  "evaluate_rankers.mjs"
  "build_task2_benchmark.mjs"
  "validate_novelty_retrospective.mjs"
  "attention_control.mjs"
  "cancer_stratification.mjs"
  "build_target_features.mjs"
  "tractability_models.mjs"
  "repurposing_validation.mjs"
  "end_to_end_pipeline.mjs"
)

PYTHON_HARNESSES=(
  "run_redock_multiseed.py"
  "run_25_drug_benchmark.py"
  "validate_25_pairs.py"
  "run_enrichment.py"
  "generate_results_md.py"
  "run_vina_vs_tanimoto.py"
)

ALL_HARNESSES=("${NODE_HARNESSES[@]}" "${PYTHON_HARNESSES[@]}")

usage() {
  sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

MODE="run"
ONLY_TARGET=""
LOCAL_RUN=0
REBUILD=0
BUILD_ONLY=0
EXTRA_ARGS=()

ORIGINAL_ARGS=("$@")

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --list)
      MODE="list"
      shift
      ;;
    --check)
      MODE="check"
      shift
      ;;
    --only)
      if [[ $# -lt 2 ]]; then
        echo "Error: --only requires a harness name, 'node', or 'python'." >&2
        exit 2
      fi
      ONLY_TARGET="$2"
      shift 2
      ;;
    --local)
      LOCAL_RUN=1
      shift
      ;;
    --rebuild)
      REBUILD=1
      shift
      ;;
    --build-only)
      BUILD_ONLY=1
      shift
      ;;
    --)
      shift
      EXTRA_ARGS=("$@")
      break
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "${MODE}" == "list" ]]; then
  echo "TargetForge benchmark harnesses (in execution order):"
  idx=1
  for h in "${ALL_HARNESSES[@]}"; do
    printf "  %2d. %s/%s\n" "${idx}" "${SCRIPTS_DIR}" "${h}"
    idx=$((idx + 1))
  done
  exit 0
fi

# Detect container runtime when running from the host.
detect_runtime() {
  if [[ -n "${CONTAINER_RUNTIME:-}" ]]; then
    echo "${CONTAINER_RUNTIME}"
    return 0
  fi
  if command -v docker >/dev/null 2>&1; then
    echo "docker"
    return 0
  fi
  if command -v podman >/dev/null 2>&1; then
    echo "podman"
    return 0
  fi
  echo "Error: neither 'docker' nor 'podman' is available on PATH." >&2
  echo "Install Docker (or Podman), or pass --local if running inside an already-provisioned environment." >&2
  exit 127
}

# If not already inside the benchmark container and not explicitly --local,
# build the image (if needed) and re-exec ourselves inside the container with
# the repository bind-mounted at /workspace so outputs write directly to the host.
if [[ "${IN_BENCHMARK_CONTAINER:-0}" != "1" && "${LOCAL_RUN}" != "1" ]]; then
  RUNTIME="$(detect_runtime)"

  if [[ "${REBUILD}" == "1" ]] || ! "${RUNTIME}" image inspect "${IMAGE_NAME}" >/dev/null 2>&1; then
    echo "[benchmarks] Building container image ${IMAGE_NAME} from benchmark/Dockerfile..."
    "${RUNTIME}" build -f "${DOCKERFILE}" -t "${IMAGE_NAME}" "${REPO_ROOT}"
  fi

  if [[ "${BUILD_ONLY}" == "1" ]]; then
    echo "[benchmarks] Image ${IMAGE_NAME} is ready."
    exit 0
  fi

  # Strip host-only flags (--rebuild, --build-only) before forwarding into the container.
  CONTAINER_ARGS=()
  skip_next=0
  for arg in "${ORIGINAL_ARGS[@]}"; do
    if [[ "${skip_next}" == "1" ]]; then
      CONTAINER_ARGS+=("${arg}")
      skip_next=0
      continue
    fi
    case "${arg}" in
      --rebuild|--build-only)
        ;;
      --only)
        CONTAINER_ARGS+=("${arg}")
        skip_next=1
        ;;
      *)
        CONTAINER_ARGS+=("${arg}")
        ;;
    esac
  done

  USER_ARGS=()
  if [[ "$(uname -s)" == "Linux" && "${RUNTIME}" == "docker" ]]; then
    USER_ARGS=(--user "$(id -u):$(id -g)")
  fi

  echo "[benchmarks] Running inside ${IMAGE_NAME} (writing outputs to ${REPO_ROOT}/benchmark/docking/)..."
  exec "${RUNTIME}" run --rm \
    "${USER_ARGS[@]}" \
    -v "${REPO_ROOT}:/workspace" \
    -w /workspace \
    -e HOME=/tmp \
    -e IN_BENCHMARK_CONTAINER=1 \
    "${IMAGE_NAME}" \
    "${CONTAINER_ARGS[@]}"
fi

if [[ "${BUILD_ONLY}" == "1" ]]; then
  echo "[benchmarks] Already inside container; skipping build."
  exit 0
fi

cd "${REPO_ROOT}"

run_check() {
  echo "[benchmarks] Verifying pinned toolchain..."
  local failures=0

  if command -v python3 >/dev/null 2>&1; then
    echo "  python3 : $(python3 --version 2>&1)"
  else
    echo "  python3 : MISSING" >&2
    failures=$((failures + 1))
  fi

  if command -v node >/dev/null 2>&1; then
    echo "  node    : $(node --version 2>&1)"
  else
    echo "  node    : MISSING" >&2
    failures=$((failures + 1))
  fi

  if command -v vina >/dev/null 2>&1; then
    echo "  vina    : $(vina --version 2>&1 | head -n 1)"
  else
    echo "  vina    : MISSING" >&2
    failures=$((failures + 1))
  fi

  if command -v obabel >/dev/null 2>&1; then
    echo "  obabel  : $(obabel -V 2>&1 | head -n 1)"
  else
    echo "  obabel  : MISSING" >&2
    failures=$((failures + 1))
  fi

  if command -v pdb2pqr >/dev/null 2>&1; then
    echo "  pdb2pqr : $(pdb2pqr --version 2>&1 | head -n 1)"
  else
    echo "  pdb2pqr : MISSING" >&2
    failures=$((failures + 1))
  fi

  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY' || failures=$((failures + 1))
import importlib
for mod in ("rdkit", "meeko", "gemmi", "spyrmsd", "numpy", "scipy", "pdb2pqr", "propka"):
    try:
        m = importlib.import_module(mod)
        ver = getattr(m, "__version__", "installed")
        print(f"  py/{mod:<7}: {ver}")
    except Exception as exc:
        print(f"  py/{mod:<7}: MISSING ({exc})")
        raise SystemExit(1)
PY
    python3 "${SCRIPTS_DIR}/run_vina_vs_tanimoto.py" --check || failures=$((failures + 1))
  fi

  if command -v node >/dev/null 2>&1; then
    node -e "import('./server/rdkitLoader.js').then(m => m.getRDKit()).then(r => { if (!r) process.exit(1); console.log('  js/rdkit: ready'); })" || failures=$((failures + 1))
  fi

  if [[ "${failures}" -gt 0 ]]; then
    echo "[benchmarks] Toolchain check FAILED (${failures} issue(s))." >&2
    exit 2
  fi
  echo "[benchmarks] All benchmark prerequisites verified."
}

if [[ "${MODE}" == "check" ]]; then
  run_check
  exit 0
fi

# Resolve which harnesses to execute.
SELECTED=()
if [[ -z "${ONLY_TARGET}" ]]; then
  SELECTED=("${ALL_HARNESSES[@]}")
elif [[ "${ONLY_TARGET}" == "node" ]]; then
  SELECTED=("${NODE_HARNESSES[@]}")
elif [[ "${ONLY_TARGET}" == "python" ]]; then
  SELECTED=("${PYTHON_HARNESSES[@]}")
else
  base="${ONLY_TARGET##*/}"
  found=0
  for h in "${ALL_HARNESSES[@]}"; do
    if [[ "${h}" == "${base}" ]]; then
      SELECTED=("${h}")
      found=1
      break
    fi
  done
  if [[ "${found}" == "0" ]]; then
    echo "Error: unknown harness '${ONLY_TARGET}'. Run './run-benchmarks.sh --list' to see valid names." >&2
    exit 2
  fi
fi

mkdir -p benchmark/docking/results benchmark/docking/data

TOTAL="${#SELECTED[@]}"
IDX=0
START_ALL="$(date +%s)"

echo "[benchmarks] Running ${TOTAL} harness(es) from ${SCRIPTS_DIR}/..."
for harness in "${SELECTED[@]}"; do
  IDX=$((IDX + 1))
  script_path="${SCRIPTS_DIR}/${harness}"
  t0="$(date +%s)"
  echo ""
  echo "========================================================================"
  echo "[benchmarks] (${IDX}/${TOTAL}) ${script_path}"
  echo "========================================================================"

  case "${harness}" in
    *.mjs)
      if [[ "${#EXTRA_ARGS[@]}" -gt 0 ]]; then
        node "${script_path}" "${EXTRA_ARGS[@]}"
      else
        node "${script_path}"
      fi
      ;;
    *.py)
      if [[ "${#EXTRA_ARGS[@]}" -gt 0 ]]; then
        python3 "${script_path}" "${EXTRA_ARGS[@]}"
      else
        python3 "${script_path}"
      fi
      ;;
    *)
      echo "Error: unsupported harness extension for ${harness}" >&2
      exit 2
      ;;
  esac

  elapsed=$(( $(date +%s) - t0 ))
  echo "[benchmarks] Completed ${harness} in ${elapsed}s."
done

TOTAL_ELAPSED=$(( $(date +%s) - START_ALL ))
echo ""
echo "[benchmarks] All ${TOTAL} harness(es) finished in ${TOTAL_ELAPSED}s."
echo "[benchmarks] Outputs written to benchmark/docking/results/ and benchmark/docking/*.md."
