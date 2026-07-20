FROM python:3.12-slim

WORKDIR /app

# Mainland Tencent Cloud: use Tencent PyPI (same-cloud network).
# Build with Aliyun instead:
#   docker build --build-arg PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple \
#     --build-arg PIP_TRUSTED_HOST=mirrors.aliyun.com .
ARG PIP_INDEX_URL=https://mirrors.cloud.tencent.com/pypi/simple
ARG PIP_TRUSTED_HOST=mirrors.cloud.tencent.com

ENV PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST} \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=. \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Pure pip + requirements.txt: avoids ghcr.io and uv sync hitting overseas CDNs.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
