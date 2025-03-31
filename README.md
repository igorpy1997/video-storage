# video-storage
1. Install dependencies
# Create virtual environment using UV
```
uv venv --python=3.12
```
# Activate virtual environment
```
source .venv/bin/activate
```
# Install dependencies
```
make sync
```
Step 3: Create .env file
Create a .env file in the root of the project and fill it with the necessary data.
```
cp .env.example .env
```
Step 4: Run the bot in Docker
```
make up
```

