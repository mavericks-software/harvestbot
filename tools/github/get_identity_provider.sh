gcloud iam workload-identity-pools providers describe "harvestbot" \
  --project="${GCLOUD_PROJECT}" \
  --location="global" \
  --workload-identity-pool="github" \
  --format="value(name)"
