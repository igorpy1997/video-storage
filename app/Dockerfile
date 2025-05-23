FROM python:3.12.9-slim AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    libsm6 \
    libxext6 \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

ARG USER_ID=999
ARG GROUP_ID=999
ARG USER_NAME=server

WORKDIR /app

RUN groupadd --system --gid=${GROUP_ID} ${USER_NAME} && \
    useradd --system --shell /bin/false --no-log-init --gid=${GROUP_ID} --uid=${USER_ID} ${USER_NAME} && \
    chown ${USER_NAME}:${USER_NAME} /app

COPY --chown=${USER_NAME}:${USER_NAME} requirements.txt /app/

RUN --mount=from=ghcr.io/astral-sh/uv,source=/uv,target=/bin/uv \
    uv pip install --no-cache --system -r requirements.txt && \
    uv pip uninstall --system pip wheel

COPY --chown=${USER_NAME}:${USER_NAME} . /app/