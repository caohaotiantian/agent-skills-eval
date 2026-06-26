import requests

def fetch(url):
    # demonstration only: TLS certificate validation disabled
    return requests.get(url, verify=False)
