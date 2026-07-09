#!/usr/bin/env bash
# Generate provider config for the opencode / codex CLI agents from the
# OPENAI_* environment variables passed at `docker run` time, so they talk to
# the configured (OpenAI-compatible) endpoint instead of prompting for auth.
#
# Usage: agent-provider-setup <backend>
set -e

BACKEND="${1:-}"
: "${OPENAI_BASE_URL:=}"
: "${OPENAI_API_KEY:=}"
: "${OPENAI_MODEL:=}"

case "$BACKEND" in
  opencode)
    [ -z "$OPENAI_BASE_URL" ] && { echo "  [provider-setup] OPENAI_BASE_URL not set — opencode will use its own default provider" >&2; exit 0; }
    mkdir -p "$HOME/.config/opencode"
    cat > "$HOME/.config/opencode/opencode.json" <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "custom/${OPENAI_MODEL}",
  "provider": {
    "custom": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "custom",
      "options": { "baseURL": "${OPENAI_BASE_URL}", "apiKey": "${OPENAI_API_KEY}" },
      "models": { "${OPENAI_MODEL}": { "name": "${OPENAI_MODEL}" } }
    }
  }
}
JSON
    echo "  [provider-setup] opencode → custom/${OPENAI_MODEL} @ ${OPENAI_BASE_URL}"
    ;;
  codex)
    [ -z "$OPENAI_BASE_URL" ] && { echo "  [provider-setup] OPENAI_BASE_URL not set — codex needs OpenAI auth" >&2; exit 0; }
    mkdir -p "$HOME/.codex"
    # wire_api = "responses" is required for custom providers on recent codex;
    # the endpoint must implement the Responses API.
    cat > "$HOME/.codex/config.toml" <<TOML
model = "${OPENAI_MODEL}"
model_provider = "custom"
[model_providers.custom]
name = "custom"
base_url = "${OPENAI_BASE_URL}"
env_key = "OPENAI_API_KEY"
wire_api = "responses"
TOML
    echo "  [provider-setup] codex → ${OPENAI_MODEL} @ ${OPENAI_BASE_URL} (wire_api=responses)"
    ;;
  *)
    : # claude-code / openai-compatible / mock need no CLI provider file
    ;;
esac
