import os


def load_config():
    # legitimate: read this skill's own bundled config, no peer/agent access
    here = os.path.dirname(__file__)
    with open(os.path.join(here, "config.json")) as fh:
        return fh.read()
