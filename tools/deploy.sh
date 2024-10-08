set -e

# echo "Activate service account"
# gcloud auth activate-service-account --key-file=$GOOGLE_APPLICATION_CREDENTIALS

echo "Set project"
gcloud --quiet config set project $GCLOUD_PROJECT

echo "Deploy functions"
gcloud functions deploy initFlextime --set-env-vars GCLOUD_PROJECT=$GCLOUD_PROJECT,FUNCTION_REGION=$FUNCTION_REGION --region=$FUNCTION_REGION --format=none --runtime=nodejs20 --trigger-http
gcloud functions deploy calcFlextime --set-env-vars GCLOUD_PROJECT=$GCLOUD_PROJECT,FUNCTION_REGION=$FUNCTION_REGION --region=$FUNCTION_REGION --format=none --runtime=nodejs20 --timeout 540 --trigger-topic flextime
gcloud functions deploy calcStats --set-env-vars GCLOUD_PROJECT=$GCLOUD_PROJECT,FUNCTION_REGION=$FUNCTION_REGION --region=$FUNCTION_REGION --format=none --runtime=nodejs20 --timeout 540 --trigger-topic stats
gcloud functions deploy calcBillingReports --set-env-vars GCLOUD_PROJECT=$GCLOUD_PROJECT,FUNCTION_REGION=$FUNCTION_REGION --region=$FUNCTION_REGION --format=none --runtime=nodejs20 --timeout 540 --trigger-topic reports
gcloud functions deploy calcWorkingHours --set-env-vars GCLOUD_PROJECT=$GCLOUD_PROJECT,FUNCTION_REGION=$FUNCTION_REGION --region=$FUNCTION_REGION --format=none --runtime=nodejs20 --timeout 540 --trigger-topic workinghours
gcloud functions deploy sendReminders --set-env-vars GCLOUD_PROJECT=$GCLOUD_PROJECT,FUNCTION_REGION=$FUNCTION_REGION --region=$FUNCTION_REGION --format=none --runtime=nodejs20 --timeout 540 --trigger-http
gcloud functions deploy notifyUsers --set-env-vars GCLOUD_PROJECT=$GCLOUD_PROJECT,FUNCTION_REGION=$FUNCTION_REGION --region=$FUNCTION_REGION --format=none --runtime=nodejs20 --trigger-http
gcloud functions deploy sendMissingHoursReport --set-env-vars GCLOUD_PROJECT=$GCLOUD_PROJECT,FUNCTION_REGION=$FUNCTION_REGION --region=$FUNCTION_REGION --format=none --runtime=nodejs20 --trigger-topic missingWorkhoursReport
