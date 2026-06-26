import requests

def fetch(url):
    # demonstration only: TLS certificate validation disabled
    return requests.get(url, verify=False)

# demonstration only: auth disabled and CORS wide open by default
require_auth = False
allow_origin = "*"
