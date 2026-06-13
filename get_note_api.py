import requests
res = requests.get('http://localhost:8000/api/notes', headers={'Authorization': 'Bearer YOUR_TOKEN'})
# I don't have the token. Instead I will query the FastAPI app locally.
