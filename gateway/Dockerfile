# The Smooth Family gateway – as a Home Assistant add-on, or on its own (see README.md).
FROM python:3.15-alpine
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY gateway.py .
CMD ["python", "-u", "gateway.py"]
