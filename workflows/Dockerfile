FROM python:3.12-slim
WORKDIR /app
# build_directory = workflows/ : le contexte Docker est ce dossier
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "-m", "patch_errors"]
