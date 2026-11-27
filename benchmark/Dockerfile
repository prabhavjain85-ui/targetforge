# syntax=docker/dockerfile:1.7
# Reproducible benchmark runner for TargetForge (benchmark/docking/scripts/*).
#
# Every scientific and runtime dependency is pinned to an explicit version so
# Python/Vina/RDKit/Open Babel and Node harnesses produce identical results on
# any host, without requiring a local Python or cheminformatics install.
#
# Build:
#   docker build -f benchmark/Dockerfile -t targetforge-benchmarks .
# Run every harness (writes results back into the mounted repo):
#   ./run-benchmarks.sh        # or: make benchmark

ARG NODE_VERSION=22.14.0
ARG RDKIT_JS_VERSION=2025.3.4-1.0.0

FROM node:${NODE_VERSION}-bookworm-slim AS node-runtime

ARG RDKIT_JS_VERSION
WORKDIR /opt/node-deps
RUN printf '{"name":"targetforge-benchmark-node-deps","private":true}\n' > package.json \
    && npm install --no-audit --no-fund --save-exact "@rdkit/rdkit@${RDKIT_JS_VERSION}" \
    && npm cache clean --force

# Multi-arch (linux/amd64 + linux/arm64) conda-forge base for pinned
# AutoDock Vina 1.2.5 and Open Babel 3.1.1 alongside Python 3.12.
FROM condaforge/miniforge3:24.11.3-2

ARG PYTHON_VERSION=3.12.8
ARG VINA_VERSION=1.2.5
ARG OPENBABEL_VERSION=3.1.1
ARG RDKIT_VERSION=2024.9.5
ARG MEEKO_VERSION=0.8.0
ARG GEMMI_VERSION=0.7.5
ARG SPYRMSD_VERSION=0.9.0
ARG NUMPY_VERSION=1.26.4
ARG SCIPY_VERSION=1.14.1
ARG PDB2PQR_VERSION=3.6.2
ARG PROPKA_VERSION=3.5.1
ARG NODE_VERSION=22.14.0
ARG RDKIT_JS_VERSION=2025.3.4-1.0.0

LABEL org.opencontainers.image.title="TargetForge Benchmark Runner" \
      org.opencontainers.image.description="Pinned Python/RDKit/AutoDock Vina/Open Babel/NumPy/SciPy + Node container for TargetForge benchmarks" \
      targetforge.python="${PYTHON_VERSION}" \
      targetforge.autodock_vina="${VINA_VERSION}" \
      targetforge.openbabel="${OPENBABEL_VERSION}" \
      targetforge.rdkit="${RDKIT_VERSION}" \
      targetforge.numpy="${NUMPY_VERSION}" \
      targetforge.scipy="${SCIPY_VERSION}" \
      targetforge.node="${NODE_VERSION}"

# Copy pinned Node.js runtime and JS RDKit WASM dependency from node-runtime
# so Node harnesses work even when /workspace is bind-mounted without node_modules.
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=node-runtime /opt/node-deps /opt/node-deps
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

# Install pinned Python, AutoDock Vina, and Open Babel from conda-forge.
RUN mamba install -n base -c conda-forge --strict-channel-priority --yes \
      "python=${PYTHON_VERSION}" \
      "vina=${VINA_VERSION}" \
      "openbabel=${OPENBABEL_VERSION}" \
    && mamba clean -a -y

# Install pinned Python packages matching benchmark/docking/requirements.txt
# plus pinned PDB2PQR + PROPKA for pH 7.4 receptor protonation.
COPY benchmark/docking/requirements.txt /tmp/benchmark-requirements.txt
RUN pip install --no-cache-dir \
      -r /tmp/benchmark-requirements.txt \
      "rdkit==${RDKIT_VERSION}" \
      "meeko==${MEEKO_VERSION}" \
      "gemmi==${GEMMI_VERSION}" \
      "spyrmsd==${SPYRMSD_VERSION}" \
      "numpy==${NUMPY_VERSION}" \
      "scipy==${SCIPY_VERSION}" \
      "pdb2pqr==${PDB2PQR_VERSION}" \
      "propka==${PROPKA_VERSION}" \
    && rm -f /tmp/benchmark-requirements.txt

# Verify every pinned toolchain component at image build time so broken images
# fail fast instead of failing hours into a docking run.
RUN python3 -c "import sys, rdkit, meeko, gemmi, spyrmsd, numpy, scipy, pdb2pqr, propka; \
assert sys.version.startswith('${PYTHON_VERSION}'), sys.version; \
assert numpy.__version__ == '${NUMPY_VERSION}', numpy.__version__; \
assert scipy.__version__ == '${SCIPY_VERSION}', scipy.__version__; \
print('Python', sys.version.split()[0], 'RDKit', rdkit.__version__, 'NumPy', numpy.__version__, 'SciPy', scipy.__version__)" \
    && mamba list -n base | grep -E "^vina[[:space:]]+${VINA_VERSION}\b" \
    && mamba list -n base | grep -E "^openbabel[[:space:]]+${OPENBABEL_VERSION}\b" \
    && vina --version | grep -F "AutoDock Vina" \
    && obabel -V | grep -F "Open Babel" \
    && pdb2pqr --version | grep -F "${PDB2PQR_VERSION}" \
    && node --version | grep -F "v${NODE_VERSION}" \
    && NODE_PATH=/opt/node-deps/node_modules node -e "require('@rdkit/rdkit/dist/RDKit_minimal.js')().then(() => console.log('RDKit WASM OK'))"

ENV IN_BENCHMARK_CONTAINER=1 \
    NODE_PATH=/opt/node-deps/node_modules \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /workspace

ENTRYPOINT ["bash", "/workspace/run-benchmarks.sh"]
