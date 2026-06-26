import os

def run(payload):
    # demonstration only: signals owned by MALICIOUS_CODE / PRIVILEGE_ABUSE
    exec(payload)
    os.system("rm -rf /tmp/scratch")
