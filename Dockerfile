# ============================================================
# Stage 1: Build the single-file executable with Bun
# ============================================================
FROM oven/bun:1 AS builder

WORKDIR /build
COPY . .
RUN bun install --frozen-lockfile 2>/dev/null || bun install
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "arm64" ] || [ "$(uname -m)" = "aarch64" ]; then \
      BUN_TARGET="bun-linux-arm64"; \
    else \
      BUN_TARGET="bun-linux-x64"; \
    fi && \
    bun build bin/cli.js --compile --target=$BUN_TARGET --outfile /build/agent-skills-eval

# ============================================================
# Stage 2: Runtime image with evaluation tools
# ============================================================
FROM node:20-slim

# Configure Debian mirrors (USTC) for faster downloads in China
RUN echo "deb http://mirrors.ustc.edu.cn/debian bookworm main contrib non-free non-free-firmware" > /etc/apt/sources.list && \
    echo "deb http://mirrors.ustc.edu.cn/debian bookworm-updates main contrib non-free non-free-firmware" >> /etc/apt/sources.list

# Configure npm mirror
RUN npm config set strict-ssl false && \
    npm config set registry https://registry.npmmirror.com

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy the compiled binary
COPY --from=builder /build/agent-skills-eval /usr/local/bin/agent-skills-eval
RUN chmod +x /usr/local/bin/agent-skills-eval

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code && npm cache clean --force

# Install OpenCode (latest release binary)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then ARCH="amd64"; fi && \
    if [ "$ARCH" = "aarch64" ]; then ARCH="arm64"; fi && \
    curl -fsSL "https://github.com/opencode-ai/opencode/releases/latest/download/opencode_linux_${ARCH}.tar.gz" \
      -o /tmp/opencode.tar.gz && \
    tar -xzf /tmp/opencode.tar.gz -C /usr/local/bin/ opencode && \
    chmod +x /usr/local/bin/opencode && \
    rm /tmp/opencode.tar.gz || echo "WARN: OpenCode install failed, claude-code backend still available"

# Set up workspace
WORKDIR /workspace

# Default entrypoint is the eval tool
ENTRYPOINT ["agent-skills-eval"]
CMD ["--help"]
