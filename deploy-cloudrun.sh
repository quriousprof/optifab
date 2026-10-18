#!/usr/bin/env bash
set -euo pipefail

PROJECT=${GCP_PROJECT:?Set GCP_PROJECT}
REGION=${GCP_REGION:-asia-south1}

AR="${REGION}-docker.pkg.dev/${PROJECT}/optifab"
BACKEND_IMAGE="${AR}/backend"
FRONTEND_IMAGE="${AR}/frontend"

echo "==> Building images with Cloud Build"
gcloud builds submit \
  --project "${PROJECT}" \
  --config cloudbuild.yaml \
  .

echo "==> Deploying backend to Cloud Run"
gcloud run deploy optifab-backend \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --image "${BACKEND_IMAGE}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080

BACKEND_URL=$(gcloud run services describe optifab-backend \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --format "value(status.url)")

echo "==> Backend deployed at ${BACKEND_URL}"

echo "==> Deploying frontend to Cloud Run"
gcloud run deploy optifab-frontend \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --image "${FRONTEND_IMAGE}" \
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
