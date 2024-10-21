gcloud iam workload-identity-pools describe "github" \
  --project="${GCLOUD_PROJECT}" \
  --location="global" \
  --format="value(name)"
