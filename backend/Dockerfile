# Multi-arch (arm64 on Raspberry Pi, amd64 on regular servers and Synology).
# Alpine/musl rather than Debian: newer glibc uses the clone3 syscall, which
# Docker < 20.10.10 (e.g. Synology DSM 6's package) blocks, so threads fail
# to start. musl doesn't use clone3, and the image is ~100 MB smaller.
FROM python:3.12-alpine

WORKDIR /srv/app

# Time zone data for icalendar / zoneinfo; pg_dump for backups made from the app
# (same major version as the postgres:16 database).
RUN apk add --no-cache tzdata postgresql16-client

# All compiled dependencies ship musllinux wheels – no compiler needed; only
# pure-Python sdists (e.g. http-ece) are built.
COPY requirements.txt .
RUN pip install --no-cache-dir --prefer-binary -r requirements.txt

COPY . .

# Not root (2.9.0): the app only writes to /data (media, backups) and /tmp. The file system can be
# mounted read-only, so no bytecode is written next to the code.
ENV PYTHONDONTWRITEBYTECODE=1
# The commit the image was built from (3.3.0) – a server compares it with the newest build.
ARG APP_BUILD=""
ENV APP_BUILD=$APP_BUILD
RUN adduser -D -H -u 10001 app
USER 10001

EXPOSE 8000
ENTRYPOINT ["./entrypoint.sh"]
