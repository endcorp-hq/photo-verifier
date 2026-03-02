#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ATTESTATION_PRIVATE_KEY_B58=<base58-secret> ./deploy.sh <stack-name> <bucket-name> [allowed-origin] [attestation-pubkey]
# Example:
#   ATTESTATION_PRIVATE_KEY_B58=... ./deploy.sh photoverifier-presign photoverifier https://yourapp.example

STACK_NAME=${1:-photoverifier-presign}
BUCKET_NAME=${2:-photoverifier}
ALLOWED_ORIGIN=${3:-'*'}
ATTESTATION_PUBLIC_KEY=${4:-Ga6SxqKLPTzrc4pykqrawSi9pvz3ZGhAdnZSBDKKioYk}
ATTESTATION_PRIVATE_KEY_B58=${ATTESTATION_PRIVATE_KEY_B58:-}

BUCKET_REGION=$(aws s3api get-bucket-location --bucket "${BUCKET_NAME}" --query 'LocationConstraint' --output text)
if [[ "${BUCKET_REGION}" == "None" || "${BUCKET_REGION}" == "null" || -z "${BUCKET_REGION}" ]]; then
  BUCKET_REGION="us-east-1"
fi

if [[ -z "${ATTESTATION_PRIVATE_KEY_B58}" ]]; then
  echo "ATTESTATION_PRIVATE_KEY_B58 env var is required."
  echo "Set it to a base58-encoded 32-byte seed (or 64-byte Solana secret key)."
  exit 1
fi

TEMPLATE_FILE="$(cd "$(dirname "$0")" && pwd)/presign-api.yaml"
CORS_FILE="$(cd "$(dirname "$0")" && pwd)/s3-cors.json"

echo "Setting S3 CORS on bucket: ${BUCKET_NAME}"
aws s3api put-bucket-cors --bucket "${BUCKET_NAME}" --cors-configuration file://"${CORS_FILE}"

echo "Deploying CloudFormation stack: ${STACK_NAME}"
echo "Detected bucket region: ${BUCKET_REGION}"
aws cloudformation deploy \
  --stack-name "${STACK_NAME}" \
  --template-file "${TEMPLATE_FILE}" \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    BucketName="${BUCKET_NAME}" \
    BucketRegion="${BUCKET_REGION}" \
    AllowedOrigin="${ALLOWED_ORIGIN}" \
    UrlExpirySeconds=300 \
    AttestationPrivateKeyBase58="${ATTESTATION_PRIVATE_KEY_B58}" \
    AttestationPublicKey="${ATTESTATION_PUBLIC_KEY}"

ENDPOINT=$(aws cloudformation describe-stacks --stack-name "${STACK_NAME}" --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' --output text)
echo "API Endpoint: ${ENDPOINT}"
echo "Presign URL:  ${ENDPOINT}/uploads"
