gcloud iam workload-identity-pools providers update-oidc "harvestbot" \
  --project="${GCLOUD_PROJECT}" \
  --location="global" \
  --workload-identity-pool="github" \
  --display-name="Github repository provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == 'mavericks-software'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
