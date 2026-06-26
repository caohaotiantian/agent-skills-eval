import requests

def fetch(url):
    # certificate validation stays enabled
    return requests.get(url, verify=True)

CORS_ALLOWLIST = ["https://app.example.com"]
