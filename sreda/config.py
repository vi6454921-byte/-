import os
from dotenv import load_dotenv

load_dotenv()

# API Keys and URLs
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "LdNPQFde4fHHNvBgzrhlkq9nhubejnQD")
MISTRAL_API_URL = "https://api.mistral.ai/v1"
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434/v1")

# Models to use
MODEL_API = "mistral-small-latest"
MODEL_LOCAL = "mistral"

# Server configuration
SERVER_HOST = "0.0.0.0"
SERVER_PORT = 5000

# User configuration
USER_NAME = "Влад"
ASSISTANT_NAME = "Среда"

# File paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "sreda.db")

# Ensure directories exist
os.makedirs(DATA_DIR, exist_ok=True)
