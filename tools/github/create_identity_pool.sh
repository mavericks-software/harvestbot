gcloud iam workload-identity-pools create "github" \
  --project=${GCLOUD_PROJECT} \
  --location="global" \
  --display-name="GitHub Actions Pool"s
