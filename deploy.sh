#!/bin/bash
# Deploy StudyLens to Google Cloud Run
# Prerequisites: gcloud CLI installed + authenticated (gcloud auth login)

set -e

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project)}"
REGION="${GCP_REGION:-asia-south1}"  # Mumbai — closest to India
SERVICE_NAME="studylens"

echo "Deploying StudyLens to Cloud Run..."
echo "  Project: ${PROJECT_ID}"
echo "  Region:  ${REGION}"
echo ""

# Single command: builds image, pushes to Artifact Registry, deploys to Cloud Run
gcloud run deploy "${SERVICE_NAME}" \
    --source . \
    --region "${REGION}" \
    --project "${PROJECT_ID}" \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --timeout 300 \
    --min-instances 0 \
    --max-instances 3 \
    --update-env-vars "WHISPER_MODEL=base" \
    --execution-environment gen2

echo ""
echo "========================================="
echo "  Deployed! Set your API keys:"
echo ""
echo "  gcloud run services update ${SERVICE_NAME} --region ${REGION} \\"
echo "    --set-env-vars OPENAI_API_KEY=sk-your-key"
echo ""
echo "  URL: $(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format 'value(status.url)')"
echo "========================================="
