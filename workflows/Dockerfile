FROM python:3.12-slim
WORKDIR /app
COPY workflows/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY workflows/ ./workflows/
CMD ["python", "-m", "workflows.patch_errors"]
