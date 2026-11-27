.PHONY: benchmark benchmark-build benchmark-check benchmark-list benchmark-node benchmark-python benchmark-task6

# Run every benchmark harness in benchmark/docking/scripts/ inside the pinned container.
benchmark:
	./run-benchmarks.sh

# Build (or rebuild) the pinned benchmark container image.
benchmark-build:
	./run-benchmarks.sh --rebuild --build-only

# Verify every pinned toolchain component inside the container without docking.
benchmark-check:
	./run-benchmarks.sh --check

# Print all harnesses in execution order.
benchmark-list:
	./run-benchmarks.sh --list

# Run only the Node (.mjs) benchmark harnesses inside the container.
benchmark-node:
	./run-benchmarks.sh --only node

# Run only the Python (.py) docking/validation harnesses inside the container.
benchmark-python:
	./run-benchmarks.sh --only python

# Run only Task 6 (AutoDock Vina vs Tanimoto) inside the container.
benchmark-task6:
	./run-benchmarks.sh --only run_vina_vs_tanimoto.py
