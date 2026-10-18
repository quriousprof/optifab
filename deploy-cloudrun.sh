#!/usr/bin/env bash
set -euo pipefail

PROJECT=${GCP_PROJECT:?Set GCP_PROJECT}
REGION=${GCP_REGION:-asia-south1}
REPO="sohamghugare/optifab"

BACKEND_IMAGE="${REPO}-backend"
FRONTEND_IMAGE="${REPO}-frontend"

echo "==> Building and pushing backend"
docker build -t "${BACKEND_IMAGE}" ./backend
docker push "${BACKEND_IMAGE}"

echo "==> Deploying backend to Cloud Run"
gcloud run deploy optifab-backend \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --image "docker.io/${BACKEND_IMAGE}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "OPTIFAB_CORS_ORIGINS=https://optifab.equaleum.com"

BACKEND_URL=$(gcloud run services describe optifab-backend \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --format "value(status.url)")

echo "==> Backend deployed at ${BACKEND_URL}"

echo "==> Building and pushing frontend"
docker build \
  --build-arg CADDYFILE=Caddyfile.cloudrun \
  -t "${FRONTEND_IMAGE}" \
  ./frontend
docker push "${FRONTEND_IMAGE}"

echo "==> Deploying frontend to Cloud Run"
gcloud run deploy optifab-frontend \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --image "docker.io/${FRONTEND_IMAGE}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "BACKEND_URL=${BACKEND_URL}"

echo "==> Done! Map custom domains:"
echo "    gcloud run domain-mappings create --service optifab-frontend --domain optifab.equaleum.com --region ${REGION}"
echo "    gcloud run domain-mappings create --service optifab-backend --domain optifab-api.equaleum.com --region ${REGION}"
