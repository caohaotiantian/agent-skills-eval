# ============================================================
# Agent Skills Evaluation — Docker Image
# Single stage: npm install + Claude Code + OpenCode
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

# Install the evaluation tool
WORKDIR /opt/agent-skills-eval
COPY package.json package-lock.json* ./
RUN npm install --production && npm cache clean --force
COPY bin/ bin/
COPY lib/ lib/
COPY evals/ evals/
COPY config/ config/
COPY types/ types/
RUN chmod +x bin/cli.js && ln -s /opt/agent-skills-eval/bin/cli.js /usr/local/bin/agent-skills-eval

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

ENTRYPOINT ["agent-skills-eval"]
CMD ["--help"]
