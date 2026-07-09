# ============================================================
# Agent Skills Evaluation — Docker Image
# Single stage: npm install + OpenCode + Codex (default backend: opencode)
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

# Install the CLI agents via npm (OpenCode + Codex) FIRST — this is the slow
# layer (downloads platform binaries) and rarely changes, so it stays cached
# even when the app code below is edited.
# opencode-ai is the maintained npm package; the old github release tarball is stale.
RUN npm install -g opencode-ai @openai/codex && npm cache clean --force

# --- Claude Code (disabled: default backend is opencode; re-enable if needed) ---
# RUN npm install -g @anthropic-ai/claude-code@2.1.109 && npm cache clean --force
# RUN mkdir -p /root/.claude && \
#     echo '{"hasCompletedOnboarding": true, "bypassPermissionsModeAccepted": true}' > /root/.claude.json

# Container-side provider setup (generates opencode/codex config from env vars at run time)
COPY docker/agent-provider-setup.sh /usr/local/bin/agent-provider-setup
RUN chmod +x /usr/local/bin/agent-provider-setup

# Install the evaluation tool. App deps first (cached unless package.json changes),
# then the app source (changes often — kept last so edits don't bust the layers above).
WORKDIR /opt/agent-skills-eval
COPY package.json package-lock.json* ./
RUN npm install --production && npm cache clean --force
COPY bin/ bin/
COPY lib/ lib/
COPY evals/ evals/
COPY config/ config/
COPY types/ types/
RUN chmod +x bin/cli.js && ln -s /opt/agent-skills-eval/bin/cli.js /usr/local/bin/agent-skills-eval \
    && chmod -R a+rX /opt/agent-skills-eval

# Set up workspace
WORKDIR /workspace

ENTRYPOINT ["agent-skills-eval"]
CMD ["--help"]
