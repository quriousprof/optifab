#!/usr/bin/env bash
set -euo pipefail

PROJECT=${GCP_PROJECT:?Set GCP_PROJECT}
REGION=${GCP_REGION:-asia-south1}
REPO="sohamghugare/optifab"

BACKEND_IMAGE="${REPO}-backend"
FRONTEND_IMAGE="${REPO}-frontend"

echo "==> Building and pushing backend"
docker build --platform linux/amd64 -t "${BACKEND_IMAGE}" ./backend
docker push "${BACKEND_IMAGE}"

echo "==> Deploying backend to Cloud Run"
gcloud run deploy optifab-backend \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --image "docker.io/${BACKEND_IMAGE}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080

BACKEND_URL=$(gcloud run services describe optifab-backend \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --format "value(status.url)")

echo "==> Backend deployed at ${BACKEND_URL}"

echo "==> Building and pushing frontend"
docker build \
  --platform linux/amd64 \
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

FRONTEND_URL=$(gcloud run services describe optifab-frontend \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --format "value(status.url)")

echo "==> Updating backend CORS with frontend URL"
gcloud run services update optifab-backend \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --set-env-vars "OPTIFAB_CORS_ORIGINS=${FRONTEND_URL}"

echo "==> Done!"
echo "    Frontend: ${FRONTEND_URL}"
echo "    Backend:  ${BACKEND_URL}"
