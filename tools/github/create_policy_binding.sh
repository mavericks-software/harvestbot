gcloud iam service-accounts add-iam-policy-binding "harvestbot@harvestbot-406508.iam.gserviceaccount.com" \
  --project="${GCLOUD_PROJECT}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/162548303702/locations/global/workloadIdentityPools/github/attribute.repository/mavericks-software/harvestbot"
